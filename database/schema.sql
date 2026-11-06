-- =============================================================================
-- DATABASE QUERY PERFORMANCE ANALYZER AND OPTIMIZATION SYSTEM
-- Relational Database Schema Specification (3NF Compliant)
-- =============================================================================

DROP DATABASE IF EXISTS query_performance_analyzer;
CREATE DATABASE query_performance_analyzer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE query_performance_analyzer;

-- -----------------------------------------------------------------------------
-- 1. Users Table (Entity: Users, 3NF compliant)
-- -----------------------------------------------------------------------------
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    role VARCHAR(30) NOT NULL DEFAULT 'ANALYST',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 2. QueryCatalog Table (Entity: QueryCatalog)
-- Stores curated, approved read-only queries eligible for benchmarking
-- -----------------------------------------------------------------------------
CREATE TABLE QueryCatalog (
    query_id INT AUTO_INCREMENT PRIMARY KEY,
    query_name VARCHAR(150) NOT NULL,
    query_sql TEXT NOT NULL,
    description TEXT,
    created_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_query_creator FOREIGN KEY (created_by) REFERENCES Users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 3. BenchmarkRuns Table (Entity: BenchmarkRuns)
-- Encapsulates a benchmark session for a given query and user
-- -----------------------------------------------------------------------------
CREATE TABLE BenchmarkRuns (
    run_id INT AUTO_INCREMENT PRIMARY KEY,
    query_id INT NOT NULL,
    user_id INT NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    environment_note TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    CONSTRAINT fk_run_query FOREIGN KEY (query_id) REFERENCES QueryCatalog(query_id) ON DELETE CASCADE,
    CONSTRAINT fk_run_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 4. BenchmarkResults Table (Entity: BenchmarkResults)
-- Records timing, returned rows, and EXPLAIN JSON execution plans
-- -----------------------------------------------------------------------------
CREATE TABLE BenchmarkResults (
    result_id INT AUTO_INCREMENT PRIMARY KEY,
    run_id INT NOT NULL,
    test_label VARCHAR(100) NOT NULL,
    elapsed_ms DECIMAL(12,3) NOT NULL,
    rows_returned BIGINT NOT NULL DEFAULT 0,
    plan_summary JSON,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_elapsed_ms CHECK (elapsed_ms >= 0),
    CONSTRAINT chk_rows_returned CHECK (rows_returned >= 0),
    CONSTRAINT fk_result_run FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 5. IndexExperiments Table (Entity: IndexExperiments)
-- Tracks B-Tree index actions (BASELINE, INDEX_CREATED, INDEX_REMOVED)
-- -----------------------------------------------------------------------------
CREATE TABLE IndexExperiments (
    experiment_id INT AUTO_INCREMENT PRIMARY KEY,
    run_id INT NOT NULL,
    index_name VARCHAR(150),
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_experiment_run FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 6. OptimizationSuggestions Table (Entity: OptimizationSuggestions)
-- Automated recommendations based on EXPLAIN plan inspection
-- -----------------------------------------------------------------------------
CREATE TABLE OptimizationSuggestions (
    suggestion_id INT AUTO_INCREMENT PRIMARY KEY,
    run_id INT NOT NULL,
    suggestion_text TEXT NOT NULL,
    rationale TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suggestion_run FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 7. BenchmarkAudit Table (Entity: BenchmarkAudit)
-- Audit trail automatically populated by the AFTER INSERT trigger
-- -----------------------------------------------------------------------------
CREATE TABLE BenchmarkAudit (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    result_id INT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    CONSTRAINT fk_audit_result FOREIGN KEY (result_id) REFERENCES BenchmarkResults(result_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- 8. DemoRecords Table (Controlled test dataset for benchmarking)
-- 100,000 synthetic rows demonstrate Full Table Scans vs Index Lookups
-- -----------------------------------------------------------------------------
CREATE TABLE DemoRecords (
    record_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    customer_name VARCHAR(100) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================================================
-- DATABASE TRIGGER: trg_benchmark_result_audit
-- Automatically fires AFTER INSERT on BenchmarkResults to maintain audit log
-- =============================================================================
DELIMITER //
CREATE TRIGGER trg_benchmark_result_audit
AFTER INSERT ON BenchmarkResults
FOR EACH ROW
BEGIN
    INSERT INTO BenchmarkAudit (
        result_id,
        event_type,
        event_time,
        details
    ) VALUES (
        NEW.result_id,
        'RESULT_INSERTED',
        CURRENT_TIMESTAMP,
        CONCAT('Benchmark result logged: ', NEW.test_label, ' | Duration: ', NEW.elapsed_ms, ' ms | Rows: ', NEW.rows_returned)
    );
END //
DELIMITER ;

-- =============================================================================
-- STORED PROCEDURE: GetBenchmarkHistory
-- Encapsulates a multi-table JOIN across QueryCatalog, BenchmarkRuns, BenchmarkResults
-- =============================================================================
DELIMITER //
CREATE PROCEDURE GetBenchmarkHistory(
    IN p_query_id INT
)
BEGIN
    SELECT 
        q.query_id,
        q.query_name,
        br.run_id,
        br.started_at,
        br.status,
        res.result_id,
        res.test_label,
        res.elapsed_ms,
        res.rows_returned,
        res.recorded_at
    FROM QueryCatalog AS q
    INNER JOIN BenchmarkRuns AS br ON q.query_id = br.query_id
    INNER JOIN BenchmarkResults AS res ON br.run_id = res.run_id
    WHERE q.query_id = p_query_id
    ORDER BY res.recorded_at DESC;
END //
DELIMITER ;

-- =============================================================================
-- DATABASE VIEW: BenchmarkSummary
-- Simplifies reporting across queries, runs, and timing measurements
-- =============================================================================
CREATE OR REPLACE VIEW BenchmarkSummary AS
SELECT 
    q.query_id,
    q.query_name,
    br.run_id,
    br.started_at,
    br.status,
    res.result_id,
    res.test_label,
    res.elapsed_ms,
    res.rows_returned,
    res.recorded_at
FROM QueryCatalog AS q
INNER JOIN BenchmarkRuns AS br ON q.query_id = br.query_id
INNER JOIN BenchmarkResults AS res ON br.run_id = res.run_id;

-- =============================================================================
-- SEED INITIAL DATA: Default Users & Approved Query Catalog
-- =============================================================================
INSERT INTO Users (user_id, full_name, email, role) VALUES 
(1, 'Lead DBA Analyst', 'analyst@querymetrics.local', 'ADMIN'),
(2, 'Systems Engineer', 'engineer@querymetrics.local', 'ANALYST');

INSERT INTO QueryCatalog (query_id, query_name, query_sql, description, created_by) VALUES
(1, 'Active Status Filter', 
 'SELECT record_id, category, status, amount FROM DemoRecords WHERE status = ''ACTIVE''', 
 'Filters records by status = ACTIVE. Without an index on status, causes a Full Table Scan (ALL).', 1),

(2, 'Category & Status Filter', 
 'SELECT record_id, category, status, amount FROM DemoRecords WHERE status = ''ACTIVE'' AND category = ''ELECTRONICS''', 
 'Filters records by composite condition. Benefits significantly from composite index idx_demo_status_category.', 1),

(3, 'Pending High-Value Orders', 
 'SELECT record_id, customer_name, amount, status FROM DemoRecords WHERE status = ''PENDING'' AND amount > 5000.00 ORDER BY amount DESC LIMIT 100', 
 'Filter with sorting and limit. Highlights filesort overhead when unindexed.', 1),

(4, 'Category Aggregation & Revenue', 
 'SELECT category, status, COUNT(*) AS total_count, AVG(amount) AS avg_amount, SUM(amount) AS total_revenue FROM DemoRecords GROUP BY category, status', 
 'Aggregates 100k rows across categories and statuses. Evaluates temporary table and grouping costs.', 1),

(5, 'Recent Records Date Range', 
 'SELECT record_id, customer_name, status, created_at FROM DemoRecords WHERE created_at >= ''2026-01-01 00:00:00'' AND status = ''ACTIVE''', 
 'Date range lookup with status filter. Tests index selectivity and range scan behavior.', 1);
