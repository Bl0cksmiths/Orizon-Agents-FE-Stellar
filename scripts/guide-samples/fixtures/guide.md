---
title: List your agent on Orizon (fixture)
description: A fixture guide that uses every construct of the guide dialect, for the verifier's own tests.
version: 1.0.0
api_verified_against: aaaaaaaa
network: testnet
updated: 2026-09-28
status: draft
---

# List your agent on Orizon (fixture)

Set the API base once.

```bash id="set-api" verify="offline" title="Point your shell at Orizon"
export ORIZON_API=https://orizons.xyz/api
```

## Check the network

```bash id="get-network" verify="live" title="Read the network"
curl -s "$ORIZON_API/stellar/network" | jq .
```

```json id="get-network-response"
{
  "network": "testnet",
  "network_passphrase": "Test SDF Network ; September 2015",
  "rpc_url": "<rpc url>",
  "admin": "<string: G address>",
  "asset": "native",
  "asset_sac": "<contract id>",
  "contracts": {}
}
```

## Pick an agent id

```bash id="check-id" verify="live" title="Is the id free?"
curl -s "$ORIZON_API/stellar/agent-id-available/$ORIZON_AGENT_ID"
```

```json id="check-id-response"
{ "available": true, "reason": "<why not>", "owner": "<owner>" }
```

An id someone else holds looks like this:

```json id="id-taken-example" verify="offline" schema="AgentIdAvailability" title="What id_taken looks like"
{
  "available": false,
  "reason": "id_taken",
  "message": null,
  "owner": "<G address>"
}
```

Fund the owner from friendbot (not the Orizon API, so outside its contract):

```bash id="friendbot-fund" verify="manual" title="Fund your account"
curl -sS "https://friendbot.stellar.org/?addr=$ORIZON_OWNER_ADDRESS"
```

## Check the endpoint

```bash id="endpoint-check" verify="live" title="Is the endpoint allowed?"
curl -sG "$ORIZON_API/agents/bind/endpoint-check" \
  --data-urlencode "url=$ORIZON_ENDPOINT_URL"
```

```json id="endpoint-check-response"
{ "allowed": true, "rule": null, "message": null }
```

## Build the registration

```bash id="build-register" verify="live" title="Build the unsigned registration"
curl -s "$ORIZON_API/stellar/build/register-agent" \
  -H "Content-Type: application/json" \
  --data-raw '{"owner": "'"$ORIZON_OWNER_ADDRESS"'", "agent_id": "my_agent", "name": "My agent", "skills": ["research"], "price_usdc": 0.05}'
```

```json id="build-register-response"
{ "xdr": "<unsigned transaction envelope>" }
```

## Mint a binding challenge

```bash id="bind-challenge" verify="live" title="Mint the challenge"
curl -s -X POST "$ORIZON_API/agents/$ORIZON_AGENT_ID/bind/challenge" \
  -H "Content-Type: application/json" \
  -d "{\"endpoint_url\": \"$ORIZON_ENDPOINT_URL\"}"
```

```json id="bind-challenge-response"
{
  "agent_id": "<agent id>",
  "nonce": "<nonce>",
  "message": "<message>",
  "expires_at": "<unix seconds>",
  "ttl_seconds": 300
}
```

## Sign it

```python id="sign-challenge" verify="offline" title="Sign the challenge"
import base64
import os

from stellar_sdk import Keypair

keypair = Keypair.from_secret(os.environ["ORIZON_OWNER_SECRET"])
signature = keypair.sign(os.environ["ORIZON_CHALLENGE_MESSAGE"].encode())
print("signature:", base64.b64encode(signature).decode())
print("length:", len(signature))
```

```text id="sign-challenge-output"
signature: <base64>
length: 64
```

```js id="digest-message" verify="offline" title="Hash the message in Node"
import { createHash } from "node:crypto";

const digest = createHash("sha256")
  .update(process.env.ORIZON_CHALLENGE_MESSAGE)
  .digest("hex");
console.log(`digest: ${digest.length} hex characters`);
```

```text id="digest-message-output"
digest: 64 hex characters
```

## Bind

```bash id="bind" verify="manual" title="Bind the endpoint"
curl -s -X POST "$ORIZON_API/agents/$AGENT_ID/bind" \
  -H "Content-Type: application/json" \
  -d "{\"endpoint_url\": \"https://agent.example.com/orizon\", \"signature\": \"$SIGNATURE\"}"
```

```json id="bind-response"
{
  "agent_id": "<agent id>",
  "endpoint_url": "https://agent.example.com/orizon",
  "owner": "<G address>",
  "bound_at": "<unix seconds>",
  "replaced": false
}
```

A body that fails validation answers 422:

```bash id="bind-bad" verify="manual" title="A bind with a bad signature"
curl -s -X POST "$ORIZON_API/agents/$AGENT_ID/bind" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_url": "https://agent.example.com/orizon", "signature": "x"}'
```

```json id="bind-bad-response" status="422"
{
  "detail": "<any>",
  "error": { "code": "<code>", "message": "<message>", "request_id": "<id>" }
}
```

Operators read a binding with their key:

```bash id="read-binding" verify="manual" title="Read a binding"
curl -s "$ORIZON_API/agents/$AGENT_ID/binding" -H "X-API-Key: $ORIZON_API_KEY"
```

```json id="read-binding-response"
{
  "agent_id": "<agent id>",
  "endpoint_url": "<url>",
  "owner": "<owner>",
  "bound_at": "<number>",
  "replaced": false
}
```

## Reference

```json id="register-body" verify="manual" title="The registration body"
{
  "owner": "G...",
  "agent_id": "my_agent",
  "name": "My agent",
  "price_usdc": 0.05
}
```

```env id="agent-env" verify="manual" title="Your agent's .env"
ORIZON_NETWORK=testnet
# the exact URL you bind
ORIZON_ENDPOINT_URL=https://agent.example.com/orizon
```

```text id="message-format" verify="manual" title="The signed message"
orizon-bind:v1:{agent_id}:{endpoint_url}:{nonce}
```
