# Switching the console to PaymentEscrow v2

PaymentEscrow v1 can never settle (D-039). v2 takes the buyer's funds into
**custody** at `authorize`, pays each delivered step's operator at `settle`,
returns the rest to the buyer, and lets the buyer `reclaim` an authorization
nobody settled once it has expired. The frozen interface lives in the
contracts repo: `docs/escrow-v2-interface.md`.

This frontend is written for v2. Its copy says that signing Authorize moves the
plan's maximum into escrow **now**, that delivered steps are paid from it and
the rest comes back, and that held funds can be reclaimed. None of that is true
of v1, so the escrow the console describes is **pinned**, and the pin is
checked three ways.

## The pin

`lib/escrow-address.json` holds the v2 escrow id for each explorer segment:

```json
{
  "public": null,
  "testnet": null
}
```

`null` means "escrow v2 is not deployed on this network yet". It is the only
value allowed until a deploy has produced a real id. **Never type a guessed or
placeholder id here**: every check below compares it against a real source and
would fail it.

| Check | Where it runs | What it compares |
|---|---|---|
| `npm run check:addresses` | CI (`addresses` job), daily (`drift.yml`) | the pin against `payment_escrow_v2` in the contracts repo's address book for that network. A `null` pin prints as `pend` and is not counted as checked. |
| `npm run smoke` | post-deploy and every 6 h (`smoke.yml`) | the pin against the escrow the **live** backend reports on `GET /api/stellar/network` (`contracts.payment_escrow`). A `null` pin prints as pending. |
| the plan card, at runtime | every buyer's browser | the same live read. When the pin is set and the backend reports another escrow, **Authorize is paused** with a notice naming both ids. Simulate is unaffected. |

The live contract parity in the smoke also knows the v2 layout: once the
address book records `payment_escrow_v2`, production's `payment_escrow` must be
that id, and v1's id (kept under `payment_escrow` as history) is no longer
compared.

## Switch steps (testnet)

Do steps 2–4 in one sitting. Between the backend switch and the frontend merge
the deployed console still speaks v1; between the contracts deploy and the
backend switch the 6-hourly smoke is red on purpose (production is not on the
escrow the address book now names).

1. **Deploy v2** (contracts repo, `Bl0cksmiths/Orizon-Agents-Smart-Contract-Stellar`):

   ```bash
   make deploy-escrow-v2 SETTLER=GDB4N25UYM3YNTTAWX7LSGI2P7OR62QZQXRNQWAGF5TFVENDKCTTCDHP
   ```

   The settler is the production signing key's public half (the one Render's
   `STELLAR_SIGNING_KEY` holds), not the admin. The target records the new id
   as `payment_escrow_v2` in `addresses.json` and keeps v1's id under
   `payment_escrow`. Commit and push that address book to the contracts repo's
   default branch.

2. **Point the backend at it.** In the Render dashboard (it overrides
   `render.yaml`), set `STELLAR_PAYMENT_ESCROW` to the `payment_escrow_v2` id,
   then **Manual Deploy** — Render does not auto-deploy this repository. Check:

   ```bash
   curl -s https://orizon-agents-be-stellar.onrender.com/readiness | jq .escrow
   # { "contract": "C…the v2 id…", "version": 2 }
   curl -s https://orizons.xyz/api/stellar/network | jq .contracts.payment_escrow
   ```

3. **Pin it in this repo.** Put the same id in `lib/escrow-address.json` under
   `"testnet"` (leave `"public"` `null`: v2 is not on mainnet). Then:

   ```bash
   ORIZON_CONTRACTS_DIR=/path/to/Orizon-Agents-Smart-Contract-Stellar npm run check:addresses
   #   ok  escrow v2 pin (testnet)  C…
   npm run smoke
   #   ✓ escrow v2 pin → live escrow is C…
   ```

   `ORIZON_ESCROW_PINS=/path/to/other.json npm run smoke` checks a pin file
   before it is committed.

4. **Disclose the switch in `README.md`.** Add a `PaymentEscrow v2` row with
   its stellar.expert testnet link beside the v1 row, and label v1 as history
   (it stays in the evidence). `npm run check:addresses` verifies every README
   link against the address book, which now holds both ids.

5. **Merge and deploy the frontend** (Vercel deploys `main`). Open
   `/app/orchestrator` with a funded testnet wallet: the pay panel should say
   the signature moves the maximum into escrow, and no "On-chain payment is
   paused" notice should show.

## Rolling back

Set the pin back to `null` and point `STELLAR_PAYMENT_ESCROW` back at v1. The
checks then report the pin as pending again. Funds already in v2 custody stay
reclaimable by their payers after expiry regardless.

## The authorization window

`AUTHORIZE_TTL_SECONDS` in `lib/escrow.ts` is 1800 s. The backend refuses to
execute against an authorization whose remaining life cannot cover a
worst-case run (about 902 s for six steps), and the buyer cannot reclaim until
it expires. The trade-off is written next to the constant; change it there
and nowhere else.
