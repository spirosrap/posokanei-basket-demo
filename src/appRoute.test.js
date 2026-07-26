import assert from "node:assert/strict";
import test from "node:test";
import { APP_ROUTES, appRouteFromPathname, isUnmodifiedPrimaryClick } from "./appRoute.js";

test("app routes support root and scoped deployments", () => {
  assert.equal(appRouteFromPathname("/", "/"), APP_ROUTES.home);
  assert.equal(appRouteFromPathname("/bargains/", "/"), APP_ROUTES.bargains);
  assert.equal(appRouteFromPathname("/changes", "/"), APP_ROUTES.changes);
  assert.equal(
    appRouteFromPathname("/demo/posokanei-basket/changes/", "/demo/posokanei-basket/"),
    APP_ROUTES.changes,
  );
  assert.equal(
    appRouteFromPathname("/demo/posokanei-basket/bargains", "/demo/posokanei-basket/"),
    APP_ROUTES.bargains,
  );
  assert.equal(
    appRouteFromPathname("/outside/changes/", "/demo/posokanei-basket/"),
    APP_ROUTES.home,
  );
});

test("only unmodified primary clicks qualify for app navigation", () => {
  const click = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
  };
  assert.equal(isUnmodifiedPrimaryClick(click), true);
  assert.equal(isUnmodifiedPrimaryClick({ ...click, metaKey: true }), false);
  assert.equal(isUnmodifiedPrimaryClick({ ...click, button: 1 }), false);
  assert.equal(isUnmodifiedPrimaryClick({ ...click, defaultPrevented: true }), false);
});
