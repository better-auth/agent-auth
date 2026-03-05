CREATE TABLE IF NOT EXISTS audit_events (
    timestamp   DateTime64(3),
    event_type  LowCardinality(String),
    org_id      String,
    actor_id    String        DEFAULT '',
    actor_type  LowCardinality(String) DEFAULT 'user',
    agent_id    String        DEFAULT '',
    host_id     String        DEFAULT '',
    target_id   String        DEFAULT '',
    target_type LowCardinality(String) DEFAULT '',
    metadata    String        DEFAULT '{}',
    ip          String        DEFAULT '',
    user_agent  String        DEFAULT ''
)
ENGINE = MergeTree()
ORDER BY (org_id, event_type, timestamp)
TTL toDateTime(timestamp) + INTERVAL 1 YEAR;

CREATE TABLE IF NOT EXISTS tool_executions (
    timestamp   DateTime64(3),
    org_id      String,
    agent_id    String,
    agent_name  String        DEFAULT '',
    user_id     String        DEFAULT '',
    tool        String,
    provider    String        DEFAULT '',
    status      LowCardinality(String),
    duration_ms UInt32        DEFAULT 0,
    error       String        DEFAULT '',
    metadata    String        DEFAULT '{}'
)
ENGINE = MergeTree()
ORDER BY (org_id, agent_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;
