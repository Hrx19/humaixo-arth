import { Types, type ClientSession } from 'mongoose';
import {
  NotificationModel,
  type NotificationType,
} from '../../models/Notification';

export type CreateNotificationInput = {
  userId: Types.ObjectId;
  type: NotificationType;
  message: string;
  dedupeKey: string;
  relatedEntityId?: Types.ObjectId;
  session?: ClientSession;
};

function serializeNotification(notification: {
  _id: Types.ObjectId;
  type: string;
  message: string;
  related_entity_id?: Types.ObjectId;
  is_read: boolean;
  created_at: Date;
}) {
  return {
    id: notification._id.toString(),
    type: notification.type,
    message: notification.message,
    related_entity_id: notification.related_entity_id?.toString() ?? null,
    is_read: notification.is_read,
    created_at: notification.created_at.toISOString(),
  };
}

export async function recordNotification(input: CreateNotificationInput) {
  const { userId, type, message, dedupeKey, relatedEntityId, session } = input;
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {}),
  };
  const filter = { userId, dedupe_key: dedupeKey };
  const update = {
    $setOnInsert: {
      userId,
      type,
      message,
      dedupe_key: dedupeKey,
      is_read: false,
      created_at: new Date(),
      ...(relatedEntityId ? { related_entity_id: relatedEntityId } : {}),
    },
  };
  const loadExisting = () => NotificationModel.findOne(filter).lean();
  let notification: Awaited<ReturnType<typeof loadExisting>>;
  try {
    notification = await NotificationModel.findOneAndUpdate(filter, update, options).lean();
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 11000 ||
      session
    ) {
      throw error;
    }
    notification = await NotificationModel.findOne(filter).lean();
  }

  if (!notification) throw new Error('The notification could not be persisted.');
  return serializeNotification(notification);
}

export async function listNotifications(userId: Types.ObjectId, limit: number) {
  const notifications = await NotificationModel.find({ userId })
    .sort({ created_at: -1, _id: -1 })
    .limit(limit)
    .lean();
  return notifications.map(serializeNotification);
}

export async function markNotificationRead(
  userId: Types.ObjectId,
  notificationId: Types.ObjectId,
) {
  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { is_read: true } },
    { new: true },
  ).lean();
  return notification ? serializeNotification(notification) : null;
}

export async function markAllNotificationsRead(userId: Types.ObjectId): Promise<number> {
  const result = await NotificationModel.updateMany(
    { userId, is_read: false },
    { $set: { is_read: true } },
  );
  return result.modifiedCount;
}
