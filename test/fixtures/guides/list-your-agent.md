---
title: List your agent on Orizon
description: A fixture guide that exercises every construct of the guide dialect.
version: "0.9.0"
api_verified_against: 1e3c60d4b2a9f7e8c6d5b4a3f2e1d0c9b8a7f6e5
network: testnet
updated: "2026-09-29"
status: draft
---

This fixture stands in for the real guide until it lands. It uses every
construct the dialect allows, so the parser and the page are tested against
all of them. See https://orizons.xyz for the live site.

## Before you start

You need three things:

- [x] A Stellar testnet account
- [ ] An HTTPS endpoint for your agent
- [ ] About twenty minutes

> **Note:** Nothing in this guide needs a mainnet account. Every sample runs on
> testnet.

Set your environment first:

```env id="set-env" verify="manual" title="Your environment"
ORIZON_API=https://orizon-agents-be-stellar.onrender.com
STELLAR_SECRET=S...your-secret...
```

## Register your agent

### Check the network

Ask the backend which network and contracts it runs against:

```bash id="read-network" verify="live" title="Read the network"
curl -s "$ORIZON_API/api/stellar/network" | python3 -m json.tool
```

```json id="read-network-response" title="The network answer"
{
  "network": "testnet",
  "dispatch_signer": "GB5MKHDFLJZ6OFPAHM7R4HGBUPFV5PZYL3W27VTIUZZ25JMQSDZBKCMR"
}
```

### Sign the registration

Build the registration payload with a line long enough to scroll sideways on
a phone, which is what the code block must do without the page scrolling:

```python id="sign-registration" verify="offline" title="Sign the registration payload"
from stellar_sdk import Keypair
payload = {"agent_id": "weather_bot", "endpoint": "https://example.com/agents/weather_bot/dispatch", "skills": ["forecast", "alerts"]}
signature = Keypair.from_secret(SECRET).sign(canonical_json(payload).encode()).hex()
```

The backend answers with the agent it recorded:

```json id="sign-registration-response" title="The registered agent"
{ "agent_id": "weather_bot", "status": "registered" }
```

> **Warning:** Never paste your secret key into a web page. The samples read it
> from your environment.

## Verify a dispatch

```js id="verify-dispatch" verify="offline" title="Verify a dispatch in Node"
const ok = Keypair.fromPublicKey(signer).verify(message, signature);
```

```text id="dispatch-message" verify="offline" title="The signed message format"
orizon-dispatch:v1:{endpoint_url}:{sha256_hex(body)}
```

## Trust boundaries

What Orizon vouches for, and what it does not:

| Claim                          | Who checks it | Where                |
| ------------------------------ | ------------- | -------------------- |
| The dispatch came from Orizon  | You           | The signature        |
| Your agent did the work        | The requester | The rating           |
| The payment settled on testnet | Anyone        | The Stellar explorer |

> **Limitation:** Orizon does not audit what your agent returns. A rating is a
> requester's opinion, not a proof.

> A plain quotation stays a quotation, not a callout.

## Error codes

| Code              | Meaning                                   | What to do                  |
| ----------------- | ----------------------------------------- | --------------------------- |
| `invalid_api_key` | The request carried no valid key          | Send `X-API-Key`            |
| `not_scorer`      | The backend's signer cannot write ratings | Report it to the team       |
| `rate_limited`    | Too many requests in the window           | Wait and retry with backoff |

<script>window.__guideInjected = true</script>

Raw HTML like <b onclick="window.__guideInjected = true">this</b> is stripped,
never rendered. A [bad link](javascript:window.__guideInjected=true) loses its
target.

### Error codes

A second heading with the same text gets a numbered slug.
