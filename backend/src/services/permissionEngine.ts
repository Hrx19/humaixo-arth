import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  AIPermissionLogModel,
  type AIPermissionDecision,
  type AIPermissionTier,
} from '../models/AIPermissionLog';
import { validateOwnerSession, type OwnerScope } from './masterKeyService';

const ACTION_TIERS: Readonly<Record<string, { tier: AIPermissionTier; resourceType: string }>> = {
  financial_query: { tier: 1, resourceType: 'financial-records' },
  list_ai_activity: { tier: 1, resourceType: 'ai-audit' },
  settings_change: { tier: 2, resourceType: 'user-settings' },
  schema_change: { tier: 2, resourceType: 'application-schema' },
  emergency_cache_flush: { tier: 3, resourceType: 'application-cache' },
  emergency_restart_service: { tier: 3, resourceType: 'application-service' },
  code_mutation: { tier: 3, resourceType: 'source-code' },
};
const ACTION_SCOPES: Readonly<Record<string, OwnerScope>> = {
  emergency_cache_flush: 'emergency:cache_flush',
  emergency_restart_service: 'emergency:restart_service',
  code_mutation: 'code:mutate',
};

export interface PermissionEvaluation {
  requestId: string;
  action: string;
  tier: AIPermissionTier;
  decision: AIPermissionDecision;
  resourceType: string;
  explanation: string;
}

export interface PermissionEvaluationInput {
  action: string;
  actorId: string;
  tenantId: Types.ObjectId;
  ownerSessionToken?: string;
}

export function classifyAction(action: string): { tier: AIPermissionTier; resourceType: string; known: boolean } {
  const classification = ACTION_TIERS[action];
  return classification
    ? { ...classification, known: true }
    : { tier: 3, resourceType: 'unknown', known: false };
}

export async function evaluatePermission(input: PermissionEvaluationInput): Promise<PermissionEvaluation> {
  const classification = classifyAction(input.action);
  const requiredScope = ACTION_SCOPES[input.action];
  const ownerSession = classification.tier === 3 && classification.known && requiredScope && input.ownerSessionToken
    ? await validateOwnerSession(input.ownerSessionToken, input.actorId, requiredScope)
    : null;
  let decision: AIPermissionDecision;
  let explanation: string;

  if (!classification.known) {
    decision = 'denied';
    explanation = 'Action is not recognized; ambiguous actions are denied.';
  } else if (classification.tier === 1) {
    decision = 'allowed';
    explanation = 'Read-only action is within autonomous access.';
  } else if (classification.tier === 2) {
    decision = 'approval_required';
    explanation = 'A human must approve this proposed change before execution.';
  } else if (ownerSession) {
    decision = 'allowed';
    explanation = 'Valid owner session authorized this break-glass action.';
  } else {
    decision = 'denied';
    explanation = 'A valid owner session with the required scope is required.';
  }

  const requestId = randomUUID();
  await AIPermissionLogModel.create({
    requestId,
    actorType: ownerSession ? 'owner' : 'ai',
    actorId: input.actorId,
    tenantId: input.tenantId,
    action: input.action,
    tier: classification.tier,
    decision,
    resourceType: classification.resourceType,
    ...(ownerSession ? { ownerSessionId: ownerSession.sessionId } : {}),
    result: explanation,
  });

  return {
    requestId,
    action: input.action,
    tier: classification.tier,
    decision,
    resourceType: classification.resourceType,
    explanation,
  };
}
