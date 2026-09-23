import { strict as assert } from "node:assert";
import { test } from "node:test";
import { linkError, otpType, safeNext, sendError } from "../src/lib/authLinks.ts";

test("safeNext only follows same-site paths", () => {
  assert.equal(safeNext("/build"), "/build");
  assert.equal(safeNext("/shoreline/dashboard"), "/shoreline/dashboard");
  for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "build"])
    assert.equal(safeNext(bad), "/build", String(bad));
});

test("otpType falls back to email", () => {
  assert.equal(otpType("magiclink"), "magiclink");
  assert.equal(otpType("nonsense"), "email");
  assert.equal(otpType(null), "email");
});

test("linkError reads Supabase's URL errors, query or hash", () => {
  assert.equal(linkError("", ""), null);
  assert.match(linkError("?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "") ?? "", /expired or has already been used/);
  assert.match(linkError("", "#error=server_error&error_description=Something+broke") ?? "", /Something broke/);
});

test("sendError names the rate limit plainly", () => {
  assert.match(sendError({ code: "over_email_send_rate_limit", message: "email rate limit exceeded", status: 429 }) ?? "", /Too many sign-in emails/);
  assert.match(sendError({ message: "For security purposes, you can only request this after 42 seconds." }) ?? "", /less than a minute ago/);
  assert.equal(sendError({ message: "something else" }), null);
  assert.equal(sendError(null), null);
});
