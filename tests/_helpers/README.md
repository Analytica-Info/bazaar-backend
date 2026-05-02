# Test Helpers

## handlerExec.js — `runHandler`

Runs a controller handler in unit tests so error paths exercised via `throw DomainError`
(or `asyncHandler` propagation) are routed through the real global `errorHandler`, letting
tests assert the final `res.status` and `res.json` values without mounting a full Express app.

### Import

```js
const { runHandler } = require('../_helpers/handlerExec');
```

### Signature

```js
const { statusCode, body, headers, res } = await runHandler(handler, req, opts);
```

| Param | Type | Description |
|-------|------|-------------|
| `handler` | Function | Controller handler `(req, res[, next])` |
| `req` | Object | Mock request (use your `makeReq()` factory) |
| `opts.path` | String | `req.path` seen by errorHandler; default `'/test'`. Use `'/v2/test'` for v2 error envelope. |

### Returned shape

```js
{
  statusCode, // HTTP status code number
  body,       // object passed to res.json()
  headers,    // object from res.set() / res.setHeader() calls
  res,        // full mock res — for cookie / clearCookie assertions
}
```

### Example

```js
it('passes 404 when user not found', async () => {
  userService.getUser.mockRejectedValue({ status: 404, message: 'not found' });
  const { statusCode, body } = await runHandler(ctrl.getUser, makeReq());
  expect(statusCode).toBe(404);
  expect(body).toHaveProperty('message');
});
```

### v2 controllers

Pass `{ path: '/v2/test' }` to get the `{ success, error: { code, message } }` envelope:

```js
const { body } = await runHandler(ctrl.login, makeReq(), { path: '/v2/test' });
expect(body.success).toBe(false);
expect(body.error.code).toBe('UNAUTHORIZED');
```
