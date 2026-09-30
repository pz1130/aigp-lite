import { EventEmitter } from "node:events";

/**
 * Global webhook event bus — publishes domain events to registered webhook endpoints.
 * Subscribers (e.g. deliverToOrg) attach to this bus via the integrations router.
 */
export class WebhookBus extends EventEmitter {
  private static _instance: WebhookBus;

  private constructor() {
    super();
  }

  static get instance(): WebhookBus {
    if (!WebhookBus._instance) {
      WebhookBus._instance = new WebhookBus();
    }
    return WebhookBus._instance;
  }
}

export const webhookBus = WebhookBus.instance;
