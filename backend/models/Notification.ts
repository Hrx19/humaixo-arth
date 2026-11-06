import { model, models, Schema, Types, type HydratedDocument, type Model } from 'mongoose';

export const NOTIFICATION_TYPES = ['budget_threshold', 'anomaly', 'import_completed'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRecord {
  userId: Types.ObjectId;
  type: NotificationType;
  message: string;
  related_entity_id?: Types.ObjectId;
  is_read: boolean;
  created_at: Date;
  dedupe_key: string;
}

export type NotificationDocument = HydratedDocument<NotificationRecord>;
type NotificationModelType = Model<NotificationRecord>;

const notificationSchema = new Schema<NotificationRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    related_entity_id: { type: Schema.Types.ObjectId },
    is_read: { type: Boolean, default: false, required: true },
    created_at: { type: Date, default: Date.now, required: true },
    dedupe_key: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { versionKey: false, collection: 'notifications' },
);

notificationSchema.index({ userId: 1, dedupe_key: 1 }, { unique: true });
notificationSchema.index({ userId: 1, is_read: 1, created_at: -1 });

export const NotificationModel =
  (models.Notification as NotificationModelType | undefined) ??
  model<NotificationRecord, NotificationModelType>('Notification', notificationSchema);
