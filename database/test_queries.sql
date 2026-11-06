-- =============================================================================
-- SYSTEM VERIFICATION & BENCHMARK VALIDATION SCRIPTS
-- Project: DATABASE QUERY PERFORMANCE ANALYZER AND OPTIMIZATION SYSTEM
-- =============================================================================

USE query_performance_analyzer;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.1 & 6.2]: Verify Database Schema & Table Structure
-- -----------------------------------------------------------------------------
SHOW TABLES;
DESCRIBE Users;
DESCRIBE QueryCatalog;
DESCRIBE BenchmarkRuns;
DESCRIBE BenchmarkResults;
DESCRIBE IndexExperiments;
DESCRIBE OptimizationSuggestions;
DESCRIBE BenchmarkAudit;
DESCRIBE DemoRecords;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.3 & 6.4]: Query Catalog & Approved Benchmark Query Selection
-- -----------------------------------------------------------------------------
SELECT query_id, query_name, description, created_at 
FROM QueryCatalog;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.5]: BASELINE EXPLAIN Output (Before Indexing - Full Table Scan)
-- Notice type: 'ALL', rows: ~100000, key: NULL
-- -----------------------------------------------------------------------------
EXPLAIN SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE';

-- In MySQL 8.0.18+, execute actual timed tree execution:
EXPLAIN ANALYZE SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- APPLY OPTIMIZATION: Create B-Tree Index on 'status'
-- -----------------------------------------------------------------------------
CREATE INDEX idx_demo_records_status ON DemoRecords(status);

-- Verify Index in MySQL:
SHOW INDEX FROM DemoRecords;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.10]: OPTIMIZED EXPLAIN Output (After Indexing - B-Tree Lookup)
-- Notice type: 'ref', key: 'idx_demo_records_status', examined rows dropped dramatically!
-- -----------------------------------------------------------------------------
EXPLAIN SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE';

EXPLAIN ANALYZE SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- [FIGURE 6.6]: Inspect Recorded Benchmark Runs & Results
-- -----------------------------------------------------------------------------
SELECT run_id, query_id, user_id, started_at, status 
FROM BenchmarkRuns;

SELECT result_id, run_id, test_label, elapsed_ms, rows_returned, recorded_at 
FROM BenchmarkResults 
ORDER BY result_id DESC;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.7]: Trigger Verification (trg_benchmark_result_audit)
-- Proves that BenchmarkAudit was populated automatically by the database trigger!
-- -----------------------------------------------------------------------------
SELECT audit_id, result_id, event_type, event_time, details 
FROM BenchmarkAudit 
ORDER BY audit_id DESC 
LIMIT 10;

-- -----------------------------------------------------------------------------
-- [FIGURE 6.8]: Stored Procedure Execution (GetBenchmarkHistory)
-- Encapsulates 3NF multi-table join (QueryCatalog + BenchmarkRuns + BenchmarkResults)
-- -----------------------------------------------------------------------------
CALL GetBenchmarkHistory(1);

-- -----------------------------------------------------------------------------
-- [FIGURE 6.9 & 6.12]: Database View (BenchmarkSummary)
-- -----------------------------------------------------------------------------
SELECT * FROM BenchmarkSummary ORDER BY recorded_at DESC;

-- -----------------------------------------------------------------------------
-- COMPOSITE INDEX EXPERIMENT: Query 2
-- -----------------------------------------------------------------------------
-- Baseline (without composite index):
EXPLAIN SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE' AND category = 'ELECTRONICS';

-- Create Composite B-Tree Index:
CREATE INDEX idx_demo_status_category ON DemoRecords(status, category);

-- Optimized:
EXPLAIN SELECT record_id, category, status, amount 
FROM DemoRecords 
WHERE status = 'ACTIVE' AND category = 'ELECTRONICS';
