# Pilot legal review brief: outbound research calls and recording

Prepared for outside counsel. Holler asks for advice on the questions in the
last section before placing any call to a real customer.

## What Holler does

Holler runs customer research for ecommerce brands on Shopify. When a
customer places an order, Holler's own staff may phone that customer within
about a day to ask how they found the brand and why they bought. The goal is
research (the answers feed a monthly report to the brand), not selling: no
offer, discount, or product pitch is made on the call.

## How a pilot call works

1. **Source of the number.** The brand installs Holler's Shopify app. Shopify
   sends Holler each new order, including the phone number and first name the
   customer gave at checkout. Holler stores them encrypted and deletes them
   after 90 days.
2. **Who is called.** Only customers matching criteria the brand chooses (for
   example first-time buyers), capped at a weekly number. Customers who have
   no usable phone or who asked not to be contacted are never queued.
3. **Who dials.** A Holler employee claims one customer and clicks "Call" in a
   browser. Each call is placed individually by a person through Twilio; there
   is no autodialer, predictive dialing, or prerecorded or artificial voice.
4. **Caller identity.** Calls come from a Holler-owned US number. The
   researcher opens with "Hi, this is [name] from Holler," and names the brand
   the customer ordered from.
5. **Recording.** Calls start unrecorded. The researcher asks: "I'd like to
   record this call for customer research. Is that okay?" Recording starts
   only after a clear yes, which the app logs with a timestamp. Silence or an
   ambiguous answer is treated as no, and the call can continue unrecorded.
6. **Retention.** Recordings are kept 30 days and research notes are kept
   with direct identifiers removed. Customers' deletion requests arriving
   through Shopify are carried out automatically.
7. **Not in the pilot.** No text messages, no calls to non-customers, and no
   sale of or sharing of phone numbers beyond Holler and its processors
   (Twilio, Cloudflare, Google Cloud, Render).

## Pilot scale

One brand, US customers only, roughly 10–50 calls per week, over about 8–12
weeks.

## Questions for counsel

1. **Basis for calling.** Do these research calls to numbers a customer gave
   at checkout need prior consent under the TCPA, given they are manually
   dialed, non-marketing, and placed by a third party on the brand's behalf?
   Does the answer change for mobile numbers?
2. **State laws.** Which state laws (for example Florida's FTSA, Oklahoma's
   OTSA, or other "mini-TCPA" statutes) apply to these calls, and do any
   require consent, registration, or disclosures that the federal analysis
   does not?
3. **Do-not-call lists.** Must Holler scrub against the National Do Not Call
   Registry or state lists for non-telemarketing research calls? What
   internal do-not-call list and opt-out handling is required, and how fast
   must an opt-out take effect?
4. **Calling hours.** What hours must be honored, and should they follow the
   customer's time zone (unknown to Holler unless derived from the area code
   or shipping address) or something more conservative?
5. **Recording consent.** Is the verbal opt-in described above sufficient in
   all-party-consent states (for example California, Florida, Illinois,
   Pennsylvania, Washington)? Must the disclosure come before any substantive
   conversation, and is the wording adequate?
6. **Caller identification.** Is the opening line sufficient, or must the
   call also state the brand's name, a callback number, or the purpose up
   front?
7. **Merchant agreement.** What must the pilot agreement with the brand say
   about who is responsible for the customer relationship and consents
   (controller/processor roles, the brand's privacy policy covering research
   calls, indemnities)? Does the brand's own privacy policy need to disclose
   these calls?
8. **Privacy laws.** Do CCPA/CPRA or other state privacy laws require notices,
   opt-outs, or a data processing agreement for this use, and are the
   retention periods above acceptable?
9. **Anything that should stop the pilot** as designed.

## Materials available on request

The product's security, privacy, and retention signoff; the recording-consent
flow; the data retention schedule; the Shopify protected-customer-data
request; and the list of subprocessors.
