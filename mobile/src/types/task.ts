/**
 * Shared task-related types used across services
 */

// Task CRUD payload – values are JSON-serialisable primitives
export type TaskPayload = Record<string, string | number | boolean | null | undefined>;
