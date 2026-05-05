# Bazaar v2 OpenAPI Spec

Single source of truth for the v2 API contract.
Location: `docs/openapi/v2.yaml`

---

## Viewing the docs locally

1. Start the server:
   ```
   V2_ENABLED=true npm start
   ```
2. Open in your browser:
   - **Swagger UI**: [http://localhost:5000/v2/docs](http://localhost:5000/v2/docs)
   - **Raw JSON spec**: [http://localhost:5000/v2/openapi.json](http://localhost:5000/v2/openapi.json)

The port defaults to `5000`; set `PORT` in your `.env` to override.

Both endpoints are public and require no authentication or `X-Client` header.

---

## Updating the spec

The spec is **hand-authored YAML** — the single source of truth.
The parity guard (see below) will fail CI if the spec and routes drift.

### When you add a new route

1. Add the route to the appropriate file under `src/routes/v2/`.
2. Add the corresponding path entry to `docs/openapi/v2.yaml`.
   - Follow the existing naming conventions (see below).
   - Reuse `$ref` to existing schemas and responses.
3. Run `npm test -- tests/v2/openapi.parity.test.js` locally to verify green.

### When you remove a route

1. Remove the route from `src/routes/v2/`.
2. Remove the path entry from `docs/openapi/v2.yaml`.
3. Run the parity test.

### When you change a response shape

Update the schema under `components.schemas` in the spec.
If the shape change is breaking, bump `info.version`.

---

## Parity guard

`tests/v2/openapi.parity.test.js` runs as part of `npm run test:ci`.

It extracts `(METHOD, path)` tuples from every file in `src/routes/v2/**/*.js`
using a regex scan, then extracts the same tuples from `docs/openapi/v2.yaml`.

It asserts:
- Every code route has a spec entry.
- Every spec entry has a backing code route.
- No duplicate `operationId` values in the spec.

On failure it prints a clear diff:

```
Routes without OpenAPI entry:
  - POST /v2/orders/checkout/gift-card

OpenAPI entries without a backing route:
  - DELETE /v2/orders/checkout/stripe
```

The guard catches drift the moment a developer adds a route without updating
the spec — no manual audit required.

---

## Naming conventions

These follow the project's pragmatic-REST patterns established in the v2 router.

| Convention | Rule |
|---|---|
| Resource paths | `/{plural-noun}` — `/orders`, `/cart`, `/products` |
| Sub-resource paths | `/{resource}/{id}/{sub-resource}` — `/orders/{orderId}/status` |
| Action paths | `/{resource}/{action}` — `/cart/increase`, `/auth/logout` |
| Path parameters | `{camelCase}` in spec, `:camelCase` in Express |
| `operationId` | `{resource}{Verb}` — `cartIncreaseQty`, `ordersCheckoutStripe` |
| Tag | Single resource noun matching the route prefix |

Platform-specific endpoints are documented with a `description` note
(`**Mobile-only**` or `**Web-only**`) and use the `XClientMobile` / `XClientWeb`
parameter refs instead of the general `XClient` ref.

---

## Generating a typed SDK

The spec is valid OpenAPI 3.1.  To generate a TypeScript client:

```bash
npx @hey-api/openapi-ts -i http://localhost:5000/v2/openapi.json -o src/generated/v2-client
```

Known gaps that affect SDK completeness:
- Several `data` payload shapes are currently `type: object` with no properties
  (Tabby buyer history, order status result).  These will generate `unknown` types
  until the shapes are pinned to production response fixtures.
- Multipart upload endpoints (`update-profile`, `update-profile`) require
  manual form-data handling regardless of codegen.
