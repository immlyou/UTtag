/**
 * Unit tests for lib/field-visibility.js
 *
 * Zero DB, zero network. Tests pure logic of FIELD_POLICY enforcement.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  canRead,
  filterFields,
  filterFieldsAll,
} = require("../lib/field-visibility");

describe("canRead", () => {
  test("admin can read tenant_users", () => {
    assert.equal(canRead("tenant_users", "admin"), true);
  });

  test("viewer role (not defined) cannot read tenant_users", () => {
    // "viewer" is not a defined role in FIELD_POLICY — should return false
    assert.equal(canRead("tenant_users", "viewer"), false);
  });

  test("operator can read tenant_users", () => {
    assert.equal(canRead("tenant_users", "operator"), true);
  });

  test("unknown resource returns false regardless of role", () => {
    assert.equal(canRead("nonexistent_resource", "admin"), false);
  });
});

describe("filterFieldsAll on tenant_users", () => {
  const rows = [
    {
      id: "u1",
      email: "a@example.com",
      name: "Alice",
      role: "admin",
      status: "active",
      phone: "0912000000",
      last_login_at: "2024-01-01",
      login_count: 5,
      created_at: "2023-01-01",
    },
  ];

  test("admin sees all fields unchanged", () => {
    const result = filterFieldsAll(rows, "tenant_users", "admin");
    assert.equal(result.length, 1);
    // admin policy is "*" — row returned as-is
    assert.deepEqual(result[0], rows[0]);
  });

  test("operator row hides phone, last_login_at, login_count", () => {
    const result = filterFieldsAll(rows, "tenant_users", "operator");
    assert.equal(result.length, 1);
    const r = result[0];
    // operator allowlist: id, email, name, role, status, created_at
    assert.ok(!("phone" in r), "phone should be hidden from operator");
    assert.ok(!("last_login_at" in r), "last_login_at should be hidden from operator");
    assert.ok(!("login_count" in r), "login_count should be hidden from operator");
    // Fields that should be present
    assert.equal(r.id, "u1");
    assert.equal(r.email, "a@example.com");
    assert.equal(r.name, "Alice");
  });

  test("user role only sees id, name, role", () => {
    const result = filterFieldsAll(rows, "tenant_users", "user");
    assert.equal(result.length, 1);
    const r = result[0];
    const keys = Object.keys(r);
    assert.deepEqual(keys.sort(), ["id", "name", "role"].sort());
  });
});

describe("filterFields edge cases", () => {
  test("unknown resource returns null", () => {
    const result = filterFields({ id: 1 }, "unknown_resource", "admin");
    assert.equal(result, null);
  });

  test("null row input returns null", () => {
    const result = filterFields(null, "tenant_users", "admin");
    assert.equal(result, null);
  });
});
