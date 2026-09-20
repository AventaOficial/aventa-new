/**
 * Deal Alerts — S6.1 contract + S6.2 Decision + S6.3 Fanout + S6.4 Persistence.
 * No delivery, cron, or money path.
 */

export * from './constants';
export * from './types';
export * from './alertability';
export * from './idempotency';
export * from './decision';
export * from './subscription';
export * from './dealDetected';
export * from './safety';
export * from './identityLayers';
export * from './decisionContext';
export * from './decideDealAlert';
export * from './subscriptionIndex';
export * from './fanoutDealAlert';
export * from './persistenceTypes';
export * from './inMemorySubscriptionStore';
export * from './subscriptionRepository';
export * from './postgresSubscriptionIndex';
