import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStripeTestEvent } from '../supabase/functions/_shared/billingArchitecture.mjs';

const metadata = {
  restaurant_id: 'a1111111-1111-4111-8111-111111111111',
  acceptance_id: 'b2222222-2222-4222-8222-222222222222',
  request_id: 'c3333333-3333-4333-8333-333333333333',
  correlation_id: 'd4444444-4444-4444-8444-444444444444',
};
const subscription = 'sub_SYNTHETIC_BINDING';
const customer = 'cus_SYNTHETIC_BINDING';
function invoice(shape = 'parent') {
  return { id: 'evt_SYNTHETIC_INVOICE_BINDING', type: 'invoice.paid', livemode: false,
    created: 1800000000, data: { object: { metadata: {}, customer, status: 'paid',
      period_start: 1800000000, period_end: 1802592000,
      ...(shape === 'parent' ? { parent: { type: 'subscription_details', subscription_details: { subscription, metadata: { ...metadata } } } }
        : shape === 'legacy' ? { subscription, subscription_details: { metadata: { ...metadata } } }
          : { subscription, metadata: { ...metadata } }),
    } } };
}

test('empty invoice metadata preserves the parent subscription snapshot and ID', () => {
  const parsed = sanitizeStripeTestEvent(invoice());
  for (const [key, value] of Object.entries(metadata)) assert.equal(parsed[key], value);
  assert.equal(parsed.provider_subscription_id, subscription);
  assert.equal(parsed.provider_customer_id, customer);
});

test('legacy snapshot and existing direct invoice metadata remain supported', () => {
  for (const shape of ['legacy', 'direct']) {
    const parsed = sanitizeStripeTestEvent(invoice(shape));
    for (const [key, value] of Object.entries(metadata)) assert.equal(parsed[key], value);
    assert.equal(parsed.provider_subscription_id, subscription);
  }
});

test('every conflicting binding key fails closed across all supplied metadata sources', () => {
  for (const key of Object.keys(metadata)) {
    for (const source of ['invoice', 'legacy']) {
      const event = invoice();
      const conflicting = { [key]: 'e5555555-5555-4555-8555-555555555555' };
      if (source === 'invoice') event.data.object.metadata = conflicting;
      else event.data.object.subscription_details = { metadata: conflicting };
      assert.throws(() => sanitizeStripeTestEvent(event), /METADATA_CONFLICT/);
    }
  }
});

test('equal UUID bindings normalize case; conflicting subscription IDs reject', () => {
  const event = invoice();
  event.data.object.metadata = Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, v.toUpperCase()]));
  event.data.object.subscription = subscription;
  assert.equal(sanitizeStripeTestEvent(event).restaurant_id, metadata.restaurant_id);
  event.data.object.subscription = 'sub_SYNTHETIC_FOREIGN';
  assert.throws(() => sanitizeStripeTestEvent(event), /SUBSCRIPTION_CONFLICT/);
});

test('missing bindings remain null; malformed or LIVE input fails closed', () => {
  const event = invoice();
  event.data.object.parent.subscription_details.metadata = {};
  assert.equal(sanitizeStripeTestEvent(event).acceptance_id, null);
  event.data.object.metadata = { request_id: 'invalid' };
  assert.throws(() => sanitizeStripeTestEvent(event), /METADATA_INVALID/);
  event.data.object.metadata = [];
  assert.throws(() => sanitizeStripeTestEvent(event), /METADATA_INVALID/);
  const live = invoice(); live.data.object.livemode = true;
  assert.throws(() => sanitizeStripeTestEvent(live), /EVENT_INVALID/);
  const wrongParent = invoice(); wrongParent.data.object.parent.type = 'quote_details';
  assert.throws(() => sanitizeStripeTestEvent(wrongParent), /SUBSCRIPTION_INVALID/);
});

test('checkout and subscription events keep their own metadata and identifiers', () => {
  for (const type of ['checkout.session.completed', 'customer.subscription.deleted']) {
    const event = invoice(); event.type = type;
    event.data.object = { id: type.startsWith('checkout.') ? 'cs_test_SYNTHETIC_BINDING' : subscription,
      subscription, customer, metadata: { ...metadata }, status: type.startsWith('checkout.') ? 'complete' : 'canceled' };
    assert.equal(sanitizeStripeTestEvent(event).provider_subscription_id, subscription);
    assert.equal(sanitizeStripeTestEvent(event).restaurant_id, metadata.restaurant_id);
  }
});
