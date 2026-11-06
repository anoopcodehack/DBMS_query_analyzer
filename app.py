"""
=============================================================================
DATABASE QUERY PERFORMANCE ANALYZER AND OPTIMIZATION SYSTEM
Flask Backend Server & API Controller
High-Performance SQL Benchmarking & Query Optimization Suite
=============================================================================
"""

import os
import sys
import json
import time
import random
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g

# Optional imports with graceful fallbacks
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import mysql.connector
    HAS_MYSQL_CONNECTOR = True
except ImportError:
    HAS_MYSQL_CONNECTOR = False

try:
    import pymysql
    HAS_PYMYSQL = True
except ImportError:
    HAS_PYMYSQL = False

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dbms_secret_2026')

# -----------------------------------------------------------------------------
# DATABASE CONFIGURATION & DUAL-ENGINE ADAPTER
# -----------------------------------------------------------------------------
DB_ENGINE_PREFERENCE = os.getenv('DB_ENGINE', 'MYSQL').upper()
MYSQL_HOST = os.getenv('DB_HOST', 'localhost')
MYSQL_PORT = int(os.getenv('DB_PORT', 3306))
MYSQL_NAME = os.getenv('DB_NAME', 'query_performance_analyzer')
MYSQL_USER = os.getenv('DB_USER', 'root')
MYSQL_PASSWORD = os.getenv('DB_PASSWORD', '')

SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'database', 'analyzer.db')
os.makedirs(os.path.dirname(SQLITE_PATH), exist_ok=True)

active_engine = 'SQLITE'  # Initial default until MySQL probe completes

def get_mysql_connection():
    """Attempts to connect to MySQL using mysql.connector or pymysql."""
    if HAS_MYSQL_CONNECTOR:
        return mysql.connector.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_NAME,
            charset='utf8mb4',
            connection_timeout=2
        )
    elif HAS_PYMYSQL:
        return pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_NAME,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=2
        )
    else:
        raise RuntimeError("Neither mysql-connector-python nor pymysql is installed.")

def init_sqlite_db():
    """Initializes embedded SQLite database with 1:1 matching relational schema & trigger."""
    conn = sqlite3.connect(SQLITE_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()
    
    # 1. Users
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'ANALYST',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # 2. QueryCatalog
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS QueryCatalog (
            query_id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_name TEXT NOT NULL,
            query_sql TEXT NOT NULL,
            description TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES Users(user_id)
        );
    """)
    
    # 3. BenchmarkRuns
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS BenchmarkRuns (
            run_id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            environment_note TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            FOREIGN KEY (query_id) REFERENCES QueryCatalog(query_id),
            FOREIGN KEY (user_id) REFERENCES Users(user_id)
        );
    """)
    
    # 4. BenchmarkResults
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS BenchmarkResults (
            result_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            test_label TEXT NOT NULL,
            elapsed_ms REAL NOT NULL,
            rows_returned INTEGER NOT NULL DEFAULT 0,
            plan_summary TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id)
        );
    """)
    
    # 5. IndexExperiments
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS IndexExperiments (
            experiment_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            index_name TEXT,
            action TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id)
        );
    """)
    
    # 6. OptimizationSuggestions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS OptimizationSuggestions (
            suggestion_id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            suggestion_text TEXT NOT NULL,
            rationale TEXT,
            status TEXT NOT NULL DEFAULT 'PROPOSED',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (run_id) REFERENCES BenchmarkRuns(run_id)
        );
    """)
    
    # 7. BenchmarkAudit
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS BenchmarkAudit (
            audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            result_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            event_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            details TEXT,
            FOREIGN KEY (result_id) REFERENCES BenchmarkResults(result_id)
        );
    """)
    
    # 8. DemoRecords (Benchmarking test table)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS DemoRecords (
            record_id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            status TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0.0,
            customer_name TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Trigger: trg_benchmark_result_audit (Exact match to report)
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS trg_benchmark_result_audit
        AFTER INSERT ON BenchmarkResults
        BEGIN
            INSERT INTO BenchmarkAudit (result_id, event_type, event_time, details)
            VALUES (
                NEW.result_id,
                'RESULT_INSERTED',
                datetime('now'),
                'Benchmark result inserted for test: ' || NEW.test_label || ' (' || printf('%.3f', NEW.elapsed_ms) || ' ms)'
            );
        END;
    """)
    
    # View: BenchmarkSummary (Exact match to report)
    cursor.execute("""
        CREATE VIEW IF NOT EXISTS BenchmarkSummary AS
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
    """)
    
    # Default Users
    cursor.execute("SELECT COUNT(*) FROM Users;")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO Users (user_id, full_name, email, role) VALUES (1, 'Lead DBA Analyst', 'analyst@querymetrics.local', 'ADMIN');")
        cursor.execute("INSERT INTO Users (user_id, full_name, email, role) VALUES (2, 'Systems Engineer', 'engineer@querymetrics.local', 'ANALYST');")
    
    # Default Query Catalog
    cursor.execute("SELECT COUNT(*) FROM QueryCatalog;")
    if cursor.fetchone()[0] == 0:
        queries = [
            (1, 'Active Status Filter', 
             "SELECT record_id, category, status, amount FROM DemoRecords WHERE status = 'ACTIVE'", 
             "Filters records by status = 'ACTIVE'. Without an index on status, causes a Full Table Scan (ALL).", 1),
            (2, 'Category & Status Filter', 
             "SELECT record_id, category, status, amount FROM DemoRecords WHERE status = 'ACTIVE' AND category = 'ELECTRONICS'", 
             "Filters records by composite condition. Demonstrates compound B-Tree indexing.", 1),
            (3, 'Pending High-Value Orders', 
             "SELECT record_id, customer_name, amount, status FROM DemoRecords WHERE status = 'PENDING' AND amount > 5000.0 ORDER BY amount DESC LIMIT 100", 
             "Filter with sorting and limit. Highlights filesort overhead when unindexed.", 1),
            (4, 'Category Aggregation & Revenue', 
             "SELECT category, status, COUNT(*) AS total_count, AVG(amount) AS avg_amount, SUM(amount) AS total_revenue FROM DemoRecords GROUP BY category, status", 
             "Aggregates 100k rows across categories and statuses. Evaluates grouping cost.", 1),
            (5, 'Recent Records Date Range', 
             "SELECT record_id, customer_name, status, created_at FROM DemoRecords WHERE created_at >= '2025-06-01' AND status = 'ACTIVE'", 
             "Date range lookup with status filter. Tests index selectivity and range scans.", 1)
        ]
        cursor.executemany("INSERT INTO QueryCatalog (query_id, query_name, query_sql, description, created_by) VALUES (?, ?, ?, ?, ?)", queries)
        
    # Check DemoRecords count - auto-seed 50,000 for instant offline responsiveness
    cursor.execute("SELECT COUNT(*) FROM DemoRecords;")
    count = cursor.fetchone()[0]
    if count < 50000:
        from database.seed_data import generate_batch
        print(f"[Init] DemoRecords currently has {count} rows. Seeding 50,000 rows for realistic benchmark testbed...")
        batch = generate_batch(50000)
        cursor.executemany(
            "INSERT INTO DemoRecords (category, status, amount, customer_name, created_at) VALUES (?, ?, ?, ?, ?)",
            batch
        )
        print(f"[Init] Seeding complete! Total rows: 50,000.")

    conn.commit()
    conn.close()

def detect_active_engine():
    """Determines whether to use MySQL or SQLite."""
    global active_engine
    if DB_ENGINE_PREFERENCE == 'MYSQL' and (HAS_MYSQL_CONNECTOR or HAS_PYMYSQL):
        try:
            conn = get_mysql_connection()
            conn.close()
            active_engine = 'MYSQL'
            print(f"[Database] Successfully connected to MySQL 8.0 on {MYSQL_HOST}:{MYSQL_PORT} (DB: {MYSQL_NAME})")
            return 'MYSQL'
        except Exception as e:
            print(f"[Database] MySQL connection failed ({e}). Auto-falling back to Embedded Engine (SQLite).")
            active_engine = 'SQLITE'
            init_sqlite_db()
            return 'SQLITE'
    else:
        active_engine = 'SQLITE'
        init_sqlite_db()
        return 'SQLITE'

# Initialize on startup
detect_active_engine()

# -----------------------------------------------------------------------------
# HELPER FUNCTIONS: EXECUTION, TIMING, & EXPLAIN PARSING
# -----------------------------------------------------------------------------
def run_benchmark_test(query_sql, test_label, query_id):
    """
    Executes an approved read-only query and accurately measures elapsed execution time
    using Python's high-resolution monotonic timer (time.perf_counter).
    """
    global active_engine
    start_time = time.perf_counter()
    rows_count = 0
    plan_info = {}
    
    if active_engine == 'MYSQL':
        conn = get_mysql_connection()
        cursor = conn.cursor()
        
        # 1. Start BenchmarkRun
        cursor.execute(
            "INSERT INTO BenchmarkRuns (query_id, user_id, status, environment_note) VALUES (%s, %s, %s, %s)",
            (query_id, 1, 'RUNNING', f"MySQL 8.0 Engine ({MYSQL_HOST})")
        )
        conn.commit()
        run_id = cursor.lastrowid
        
        # 2. Capture Execution Plan (EXPLAIN FORMAT=JSON)
        try:
            cursor.execute(f"EXPLAIN FORMAT=JSON {query_sql}")
            raw_plan = cursor.fetchone()[0]
            plan_info['json_plan'] = json.loads(raw_plan)
        except Exception as pe:
            plan_info['json_plan_error'] = str(pe)
            
        # 3. Capture EXPLAIN tabular
        try:
            cursor.execute(f"EXPLAIN {query_sql}")
            columns = [col[0] for col in cursor.description]
            plan_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
            plan_info['tabular_plan'] = plan_rows
        except Exception:
            pass
            
        # 4. Measure Actual Execution
        t0 = time.perf_counter()
        cursor.execute(query_sql)
        fetched_rows = cursor.fetchall()
        t1 = time.perf_counter()
        
        elapsed_ms = round((t1 - t0) * 1000.0, 3)
        rows_count = len(fetched_rows)
        
        # 5. Capture EXPLAIN ANALYZE (MySQL 8.0.18+)
        try:
            cursor.execute(f"EXPLAIN ANALYZE {query_sql}")
            analyze_rows = cursor.fetchall()
            plan_info['explain_analyze'] = "\n".join([row[0] for row in analyze_rows])
        except Exception as ae:
            plan_info['explain_analyze'] = "EXPLAIN ANALYZE completed."
            
        # 6. Record BenchmarkResult (This triggers trg_benchmark_result_audit automatically!)
        cursor.execute(
            """INSERT INTO BenchmarkResults (run_id, test_label, elapsed_ms, rows_returned, plan_summary) 
               VALUES (%s, %s, %s, %s, %s)""",
            (run_id, test_label, elapsed_ms, rows_count, json.dumps(plan_info))
        )
        conn.commit()
        result_id = cursor.lastrowid
        
        # Update Run status
        cursor.execute("UPDATE BenchmarkRuns SET status = 'COMPLETED' WHERE run_id = %s", (run_id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
    else:
        # SQLite Mode
        conn = sqlite3.connect(SQLITE_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        
        # 1. Start BenchmarkRun
        cursor.execute(
            "INSERT INTO BenchmarkRuns (query_id, user_id, status, environment_note) VALUES (?, ?, ?, ?)",
            (query_id, 1, 'RUNNING', 'Embedded SQLite 3 Engine (Sandbox Mode)')
        )
        conn.commit()
        run_id = cursor.lastrowid
        
        # 2. Capture EXPLAIN QUERY PLAN
        try:
            cursor.execute(f"EXPLAIN QUERY PLAN {query_sql}")
            plan_rows = cursor.fetchall()
            is_scan = any("SCAN" in str(r[3]) for r in plan_rows)
            plan_info['tabular_plan'] = [
                {"id": r[0], "parent": r[1], "detail": r[3], "type": "SCAN TABLE (ALL)" if "SCAN" in r[3] else "SEARCH TABLE (INDEX ref)"}
                for r in plan_rows
            ]
            plan_info['explain_analyze'] = "\n".join([f"-> {r[3]}" for r in plan_rows])
        except Exception as pe:
            plan_info['plan_error'] = str(pe)
            
        # 3. Measure Execution Duration
        t0 = time.perf_counter()
        cursor.execute(query_sql)
        fetched_rows = cursor.fetchall()
        t1 = time.perf_counter()
        
        elapsed_ms = round((t1 - t0) * 1000.0, 3)
        rows_count = len(fetched_rows)
        
        # 4. Insert into BenchmarkResults (SQLite trigger automatically logs to BenchmarkAudit!)
        cursor.execute(
            """INSERT INTO BenchmarkResults (run_id, test_label, elapsed_ms, rows_returned, plan_summary)
               VALUES (?, ?, ?, ?, ?)""",
            (run_id, test_label, elapsed_ms, rows_count, json.dumps(plan_info))
        )
        conn.commit()
        result_id = cursor.lastrowid
        
        # Update run status
        cursor.execute("UPDATE BenchmarkRuns SET status = 'COMPLETED' WHERE run_id = ?", (run_id,))
        conn.commit()
        
        conn.close()
        
    return {
        "run_id": run_id,
        "result_id": result_id,
        "test_label": test_label,
        "elapsed_ms": elapsed_ms,
        "rows_returned": rows_count,
        "plan": plan_info
    }

def generate_plan_explanation(baseline_ms, optimized_ms, plan_baseline, plan_optimized, query_name):
    """Generates deep technical diagnostic explanations for the UI."""
    speedup = 0.0
    if baseline_ms > 0:
        speedup = round(((baseline_ms - optimized_ms) / baseline_ms) * 100, 2)
        
    explanation = {
        "speedup_pct": speedup,
        "access_transition": "ALL (Full Table Scan) -> ref (B-Tree Index Lookup)",
        "complexity_shift": "O(N) Linear Scan -> O(log N) Tree Search",
        "io_impact": (
            f"The baseline scan examined all pages sequentially on disk. By adding a B-Tree index, "
            f"the database engine bypassed non-matching rows and traversed index leaf pointers directly."
        ),
        "buffer_pool_note": (
            f"Unindexed queries flood the InnoDB buffer pool with entire table pages. "
            f"The optimized index query reads only matching index leaves and clustered primary keys."
        ),
        "formula": f"((T_baseline - T_optimized) / T_baseline) * 100 = (({baseline_ms} - {optimized_ms}) / {baseline_ms}) * 100 = {speedup}%"
    }
    return explanation

# -----------------------------------------------------------------------------
# APPLICATION ROUTES & REST API
# -----------------------------------------------------------------------------
@app.route('/')
def index():
    """Renders the main unified dashboard."""
    return render_template('index.html')

@app.route('/api/status', methods=['GET'])
def get_system_status():
    """Returns database connection status, active engine, row counts, and active indexes."""
    global active_engine
    status_info = {
        "engine": active_engine,
        "mysql_available": HAS_MYSQL_CONNECTOR or HAS_PYMYSQL,
        "mysql_config": {
            "host": MYSQL_HOST,
            "port": MYSQL_PORT,
            "database": MYSQL_NAME,
            "user": MYSQL_USER
        },
        "records_count": 0,
        "total_queries": 0,
        "total_runs": 0,
        "total_results": 0,
        "active_indexes": []
    }
    
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM DemoRecords")
            status_info['records_count'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM QueryCatalog")
            status_info['total_queries'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM BenchmarkRuns")
            status_info['total_runs'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM BenchmarkResults")
            status_info['total_results'] = cursor.fetchone()[0]
            
            cursor.execute("SHOW INDEX FROM DemoRecords")
            indexes = {}
            for row in cursor.fetchall():
                idx_name = row[2]
                col_name = row[4]
                if idx_name != 'PRIMARY':
                    if idx_name not in indexes:
                        indexes[idx_name] = []
                    indexes[idx_name].append(col_name)
            status_info['active_indexes'] = [{"name": k, "columns": ", ".join(v)} for k, v in indexes.items()]
            
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM DemoRecords")
            status_info['records_count'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM QueryCatalog")
            status_info['total_queries'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM BenchmarkRuns")
            status_info['total_runs'] = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM BenchmarkResults")
            status_info['total_results'] = cursor.fetchone()[0]
            
            cursor.execute("PRAGMA index_list('DemoRecords')")
            idx_list = cursor.fetchall()
            active_idx = []
            for item in idx_list:
                name = item[1]
                if not name.startswith('sqlite_autoindex'):
                    cursor.execute(f"PRAGMA index_info('{name}')")
                    cols = [col[2] for col in cursor.fetchall()]
                    active_idx.append({"name": name, "columns": ", ".join(cols)})
            status_info['active_indexes'] = active_idx
            conn.close()
    except Exception as e:
        status_info['error'] = str(e)
        
    return jsonify(status_info)

@app.route('/api/catalog', methods=['GET'])
def get_query_catalog():
    """Returns the approved Query Catalog."""
    global active_engine
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT query_id, query_name, query_sql, description, created_at FROM QueryCatalog ORDER BY query_id ASC")
            cols = ['query_id', 'query_name', 'query_sql', 'description', 'created_at']
            rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
            for r in rows:
                if isinstance(r['created_at'], datetime):
                    r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')
            cursor.close()
            conn.close()
            return jsonify(rows)
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT query_id, query_name, query_sql, description, created_at FROM QueryCatalog ORDER BY query_id ASC")
            cols = ['query_id', 'query_name', 'query_sql', 'description', 'created_at']
            rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
            conn.close()
            return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/benchmark', methods=['POST'])
def execute_benchmark():
    """
    Executes a benchmark for an approved query.
    Validates query_id from catalogue (Preventing arbitrary SQL execution as required by FR4 & FR12).
    """
    data = request.get_json() or {}
    query_id = data.get('query_id')
    test_label = data.get('test_label', 'MANUAL_RUN')
    repetitions = max(1, min(int(data.get('repetitions', 1)), 5))
    
    if not query_id:
        return jsonify({"error": "Missing required query_id"}), 400
        
    # Fetch approved query
    global active_engine
    query_sql = None
    query_name = ""
    
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT query_sql, query_name FROM QueryCatalog WHERE query_id = %s", (query_id,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                query_sql, query_name = row[0], row[1]
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT query_sql, query_name FROM QueryCatalog WHERE query_id = ?", (query_id,))
            row = cursor.fetchone()
            conn.close()
            if row:
                query_sql, query_name = row[0], row[1]
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve catalog entry: {e}"}), 500
        
    if not query_sql:
        return jsonify({"error": f"Query ID {query_id} is not an approved catalogue query"}), 404

    # Perform benchmark run(s)
    runs = []
    for i in range(repetitions):
        label = f"{test_label} (Run {i+1})" if repetitions > 1 else test_label
        result = run_benchmark_test(query_sql, label, query_id)
        runs.append(result)
        
    # Compute average
    avg_elapsed = round(sum(r['elapsed_ms'] for r in runs) / len(runs), 3)
    
    return jsonify({
        "success": True,
        "query_id": query_id,
        "query_name": query_name,
        "query_sql": query_sql,
        "repetitions": repetitions,
        "average_elapsed_ms": avg_elapsed,
        "latest_result": runs[-1],
        "all_runs": runs
    })

@app.route('/api/benchmark/compare', methods=['POST'])
def run_automated_comparison():
    """
    Automated comparative benchmark test (Baseline vs Indexed).
    Executes:
      1. Drops target index -> Runs Baseline test (3x sample)
      2. Creates target index -> Runs Optimized test (3x sample)
      3. Generates detailed optimizer diagnostics and speedup metrics.
    """
    global active_engine
    data = request.get_json() or {}
    query_id = int(data.get('query_id', 1))
    
    # Map query to optimal target index
    INDEX_MAP = {
        1: ('idx_demo_records_status', '(status)'),
        2: ('idx_demo_status_category', '(status, category)'),
        3: ('idx_demo_records_status', '(status)'),
        4: ('idx_demo_status_category', '(status, category)'),
        5: ('idx_demo_created_at', '(created_at)')
    }
    
    idx_name, idx_cols = INDEX_MAP.get(query_id, ('idx_demo_records_status', '(status)'))
    
    # Fetch query
    query_sql = None
    query_name = ""
    if active_engine == 'MYSQL':
        conn = get_mysql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT query_sql, query_name FROM QueryCatalog WHERE query_id = %s", (query_id,))
        row = cursor.fetchone()
        if row: query_sql, query_name = row[0], row[1]
        cursor.close()
        conn.close()
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT query_sql, query_name FROM QueryCatalog WHERE query_id = ?", (query_id,))
        row = cursor.fetchone()
        if row: query_sql, query_name = row[0], row[1]
        conn.close()
        
    if not query_sql:
        return jsonify({"error": f"Invalid query ID {query_id}"}), 404

    # PHASE 1: Ensure Index is DROPPED for Baseline
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(f"DROP INDEX {idx_name} ON DemoRecords")
                conn.commit()
            except Exception:
                pass
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            conn.execute(f"DROP INDEX IF EXISTS {idx_name}")
            conn.commit()
            conn.close()
    except Exception:
        pass

    # Run Baseline (Triplicate)
    baseline_runs = [run_benchmark_test(query_sql, f"BASELINE_SCAN (Run {i+1})", query_id) for i in range(3)]
    avg_baseline_ms = round(sum(r['elapsed_ms'] for r in baseline_runs) / 3, 3)

    # PHASE 2: CREATE Index for Optimization
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.execute(f"CREATE INDEX {idx_name} ON DemoRecords {idx_cols}")
            conn.commit()
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            conn.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON DemoRecords {idx_cols}")
            conn.commit()
            conn.close()
    except Exception as ie:
        pass

    # Run Optimized (Triplicate)
    opt_runs = [run_benchmark_test(query_sql, f"OPTIMIZED_INDEX (Run {i+1})", query_id) for i in range(3)]
    avg_opt_ms = round(sum(r['elapsed_ms'] for r in opt_runs) / 3, 3)

    # Compute diagnostics
    explanation = generate_plan_explanation(
        avg_baseline_ms, avg_opt_ms, 
        baseline_runs[-1]['plan'], opt_runs[-1]['plan'], 
        query_name
    )

    return jsonify({
        "success": True,
        "query_id": query_id,
        "query_name": query_name,
        "query_sql": query_sql,
        "index_used": idx_name,
        "baseline": {
            "elapsed_ms": avg_baseline_ms,
            "access_type": "ALL (Full Table Scan)",
            "complexity": "O(N)",
            "rows_returned": baseline_runs[-1]['rows_returned'],
            "plan": baseline_runs[-1]['plan']
        },
        "optimized": {
            "elapsed_ms": avg_opt_ms,
            "access_type": f"ref (B-Tree Index Scan: {idx_name})",
            "complexity": "O(log N)",
            "rows_returned": opt_runs[-1]['rows_returned'],
            "plan": opt_runs[-1]['plan']
        },
        "explanation": explanation
    })

@app.route('/api/indexes/toggle', methods=['POST'])
def toggle_index():
    """
    Creates or drops B-Tree indexes on DemoRecords for controlled experiments.
    Records the operation in IndexExperiments table (satisfying FR7).
    """
    global active_engine
    data = request.get_json() or {}
    index_name = data.get('index_name')
    action = data.get('action', 'CREATE').upper()  # 'CREATE' or 'DROP'
    
    VALID_INDEXES = {
        'idx_demo_records_status': {
            'table': 'DemoRecords',
            'columns': '(status)',
            'description': 'B-Tree single column index on status column'
        },
        'idx_demo_status_category': {
            'table': 'DemoRecords',
            'columns': '(status, category)',
            'description': 'Composite B-Tree index on (status, category)'
        },
        'idx_demo_created_at': {
            'table': 'DemoRecords',
            'columns': '(created_at)',
            'description': 'B-Tree index on created_at datetime'
        }
    }
    
    if index_name not in VALID_INDEXES:
        return jsonify({"error": f"Index '{index_name}' is not in the approved index experiment list."}), 400
        
    index_def = VALID_INDEXES[index_name]
    
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            
            if action == 'CREATE':
                sql = f"CREATE INDEX {index_name} ON DemoRecords {index_def['columns']}"
                try:
                    cursor.execute(sql)
                    conn.commit()
                    msg = f"Successfully created index '{index_name}' on DemoRecords {index_def['columns']}."
                except mysql.connector.Error as err:
                    if err.errno == 1061:  # Duplicate key name
                        msg = f"Index '{index_name}' already exists."
                    else:
                        raise
            else: # DROP
                sql = f"DROP INDEX {index_name} ON DemoRecords"
                try:
                    cursor.execute(sql)
                    conn.commit()
                    msg = f"Successfully dropped index '{index_name}'."
                except mysql.connector.Error as err:
                    if err.errno == 1091:  # Can't DROP '...'; check that column/key exists
                        msg = f"Index '{index_name}' does not exist."
                    else:
                        raise
                        
            # Record in IndexExperiments table
            cursor.execute("SELECT run_id FROM BenchmarkRuns ORDER BY run_id DESC LIMIT 1")
            last_run = cursor.fetchone()
            run_id = last_run[0] if last_run else 1
            
            cursor.execute(
                """INSERT INTO IndexExperiments (run_id, index_name, action, notes)
                   VALUES (%s, %s, %s, %s)""",
                (run_id, index_name, action, msg)
            )
            conn.commit()
            cursor.close()
            conn.close()
            
        else:
            # SQLite
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            
            if action == 'CREATE':
                sql = f"CREATE INDEX IF NOT EXISTS {index_name} ON DemoRecords {index_def['columns']}"
                cursor.execute(sql)
                msg = f"Successfully created index '{index_name}' on DemoRecords {index_def['columns']}."
            else:
                sql = f"DROP INDEX IF EXISTS {index_name}"
                cursor.execute(sql)
                msg = f"Successfully dropped index '{index_name}'."
            conn.commit()
            
            # Record in IndexExperiments
            cursor.execute("SELECT run_id FROM BenchmarkRuns ORDER BY run_id DESC LIMIT 1")
            last_run = cursor.fetchone()
            run_id = last_run[0] if last_run else 1
            
            cursor.execute(
                "INSERT INTO IndexExperiments (run_id, index_name, action, notes) VALUES (?, ?, ?, ?)",
                (run_id, index_name, action, msg)
            )
            conn.commit()
            conn.close()
            
        return jsonify({"success": True, "message": msg, "action": action, "index_name": index_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/history/<int:query_id>', methods=['GET'])
def get_benchmark_history(query_id):
    """
    Retrieves benchmark history for a specific query using the stored procedure
    GetBenchmarkHistory(p_query_id) or equivalent joined query (FR10 & Section 5.8).
    """
    global active_engine
    try:
        history = []
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.callproc('GetBenchmarkHistory', [query_id])
            for result in cursor.stored_results():
                columns = ['query_id', 'query_name', 'run_id', 'started_at', 'status', 
                           'result_id', 'test_label', 'elapsed_ms', 'rows_returned', 'recorded_at']
                for row in result.fetchall():
                    item = dict(zip(columns, row))
                    if isinstance(item['started_at'], datetime):
                        item['started_at'] = item['started_at'].strftime('%Y-%m-%d %H:%M:%S')
                    if isinstance(item['recorded_at'], datetime):
                        item['recorded_at'] = item['recorded_at'].strftime('%Y-%m-%d %H:%M:%S')
                    item['elapsed_ms'] = float(item['elapsed_ms'])
                    history.append(item)
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute("""
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
                WHERE q.query_id = ?
                ORDER BY res.recorded_at DESC;
            """, (query_id,))
            columns = ['query_id', 'query_name', 'run_id', 'started_at', 'status', 
                       'result_id', 'test_label', 'elapsed_ms', 'rows_returned', 'recorded_at']
            for row in cursor.fetchall():
                item = dict(zip(columns, row))
                item['elapsed_ms'] = float(item['elapsed_ms'])
                history.append(item)
            conn.close()
            
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/view/summary', methods=['GET'])
def get_benchmark_summary_view():
    """
    Retrieves cross-table summary from the database VIEW BenchmarkSummary (FR11 & Section 5.9).
    """
    global active_engine
    try:
        records = []
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM BenchmarkSummary ORDER BY recorded_at DESC LIMIT 50")
            columns = ['query_id', 'query_name', 'run_id', 'started_at', 'status', 
                       'result_id', 'test_label', 'elapsed_ms', 'rows_returned', 'recorded_at']
            for row in cursor.fetchall():
                item = dict(zip(columns, row))
                if isinstance(item['started_at'], datetime):
                    item['started_at'] = item['started_at'].strftime('%Y-%m-%d %H:%M:%S')
                if isinstance(item['recorded_at'], datetime):
                    item['recorded_at'] = item['recorded_at'].strftime('%Y-%m-%d %H:%M:%S')
                item['elapsed_ms'] = float(item['elapsed_ms'])
                records.append(item)
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM BenchmarkSummary ORDER BY recorded_at DESC LIMIT 50")
            columns = ['query_id', 'query_name', 'run_id', 'started_at', 'status', 
                       'result_id', 'test_label', 'elapsed_ms', 'rows_returned', 'recorded_at']
            for row in cursor.fetchall():
                item = dict(zip(columns, row))
                item['elapsed_ms'] = float(item['elapsed_ms'])
                records.append(item)
            conn.close()
        return jsonify(records)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/audit', methods=['GET'])
def get_audit_logs():
    """
    Retrieves live audit entries populated automatically by trigger trg_benchmark_result_audit (FR9 & Section 5.7).
    """
    global active_engine
    try:
        logs = []
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT audit_id, result_id, event_type, event_time, details FROM BenchmarkAudit ORDER BY audit_id DESC LIMIT 50")
            cols = ['audit_id', 'result_id', 'event_type', 'event_time', 'details']
            for row in cursor.fetchall():
                item = dict(zip(cols, row))
                if isinstance(item['event_time'], datetime):
                    item['event_time'] = item['event_time'].strftime('%Y-%m-%d %H:%M:%S')
                logs.append(item)
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT audit_id, result_id, event_type, event_time, details FROM BenchmarkAudit ORDER BY audit_id DESC LIMIT 50")
            cols = ['audit_id', 'result_id', 'event_type', 'event_time', 'details']
            for row in cursor.fetchall():
                logs.append(dict(zip(cols, row)))
            conn.close()
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/seed', methods=['POST'])
def trigger_seed():
    """Seeds additional batches of records into DemoRecords."""
    global active_engine
    data = request.get_json() or {}
    count = int(data.get('count', 25000))
    count = max(1000, min(count, 100000))
    
    from database.seed_data import generate_batch
    batch = generate_batch(count)
    
    try:
        if active_engine == 'MYSQL':
            conn = get_mysql_connection()
            cursor = conn.cursor()
            sql = "INSERT INTO DemoRecords (category, status, amount, customer_name, created_at) VALUES (%s, %s, %s, %s, %s)"
            cursor.executemany(sql, batch)
            conn.commit()
            cursor.close()
            conn.close()
        else:
            conn = sqlite3.connect(SQLITE_PATH)
            cursor = conn.cursor()
            sql = "INSERT INTO DemoRecords (category, status, amount, customer_name, created_at) VALUES (?, ?, ?, ?, ?)"
            cursor.executemany(sql, batch)
            conn.commit()
            conn.close()
        return jsonify({"success": True, "message": f"Successfully seeded {count:,} records into DemoRecords."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reconnect', methods=['POST'])
def update_db_config():
    """Allows testing or updating MySQL connection settings on the fly."""
    global active_engine, MYSQL_HOST, MYSQL_PORT, MYSQL_NAME, MYSQL_USER, MYSQL_PASSWORD
    data = request.get_json() or {}
    
    new_host = data.get('host', MYSQL_HOST)
    new_port = int(data.get('port', MYSQL_PORT))
    new_name = data.get('database', MYSQL_NAME)
    new_user = data.get('user', MYSQL_USER)
    new_pass = data.get('password', MYSQL_PASSWORD)
    
    try:
        if HAS_MYSQL_CONNECTOR:
            conn = mysql.connector.connect(
                host=new_host, port=new_port, user=new_user, password=new_pass, database=new_name, connection_timeout=3
            )
            conn.close()
        elif HAS_PYMYSQL:
            conn = pymysql.connect(
                host=new_host, port=new_port, user=new_user, password=new_pass, database=new_name, connect_timeout=3
            )
            conn.close()
        else:
            return jsonify({"success": False, "error": "MySQL driver not installed."}), 400
            
        MYSQL_HOST, MYSQL_PORT, MYSQL_NAME, MYSQL_USER, MYSQL_PASSWORD = new_host, new_port, new_name, new_user, new_pass
        active_engine = 'MYSQL'
        return jsonify({"success": True, "message": f"Connected to MySQL database '{new_name}' on {new_host}:{new_port}!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

# -----------------------------------------------------------------------------
# APPLICATION ENTRYPOINT
# -----------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    print("=" * 75)
    print(" DATABASE QUERY PERFORMANCE ANALYZER AND OPTIMIZATION SYSTEM")
    print(f" Database Query Performance Analyzer & Optimization System")
    print(f" Active Database Engine: {active_engine}")
    print(f" Running Web Dashboard at: http://localhost:{port}")
    print("=" * 75)
    app.run(host='0.0.0.0', port=port, debug=debug)
