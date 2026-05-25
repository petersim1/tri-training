export type StravaWebhookEvent = {
  object_type?: string;
  object_id?: number;
  aspect_type?: string;
  owner_id?: number;
  subscription_id?: number;
  event_time?: number;
  updates?: Record<string, string>;
};
