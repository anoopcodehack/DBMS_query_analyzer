# Database Query Performance Analyzer & Optimization System

An interactive academic DBMS mini-project and benchmarking laboratory developed for the **Department of Computer Science and Engineering, Sahyadri College of Engineering & Management, Mangaluru** (Academic Year: 2026–2027).

---

## 📌 1. Project Overview

The **Database Query Performance Analyzer and Optimization System** demonstrates core Database Management System (DBMS) concepts in action:
* **Relational Database Design in Third Normal Form (3NF)**: Clean separation of users, query catalogs, benchmark runs, results, index experiments, and audit records.
* **Controlled Query Benchmarking**: Monotonic high-resolution measurement (`time.perf_counter()`) of approved queries.
* **Execution Plan Analysis (`EXPLAIN` & `EXPLAIN ANALYZE`)**: Real-time inspection of access methods (`type: ALL` Full Table Scan vs `type: ref` Index Scan).
* **B-Tree Indexing Optimization**: Demonstrating 90%+ query latency reductions on datasets with up to 100,000 records.
* **Database Trigger**: `trg_benchmark_result_audit` automatically captures and logs audit entries upon every benchmark result insertion.
* **Stored Procedure**: `GetBenchmarkHistory(p_query_id)` encapsulates complex 3-table relational joins for benchmark analytics.
* **Database View**: `BenchmarkSummary` provides simplified cross-table reporting.

---

## 🛠️ 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Database** | **MySQL 8.0+** (with InnoDB engine) / Embedded SQLite fallback | Storing relational entities, executing B-Tree indexing, triggers, procedures, views |
| **Backend** | **Python 3.x (Flask)** | REST API, high-resolution execution timing, input validation |
| **Database Driver** | `mysql-connector-python` & `pymysql` | Reliable, parameterized communication with MySQL server |
| **Frontend UI** | **HTML5 + Tailwind CSS (CDN) + JavaScript** | Responsive, dark/light theme dashboard |
| **Data Visualization** | **Chart.js** | Side-by-side Before vs After performance bar charts |
| **Developer Tools** | **VS Code + MySQL Workbench** | Database modeling, testing queries, and screenshot generation |

---

## 🏗️ 3. Relational Schema & 3NF Normalization

### Tables in the System:
1. **`Users`**: `user_id` (PK), `full_name`, `email` (UK), `role`, `created_at`
2. **`QueryCatalog`**: `query_id` (PK), `query_name`, `query_sql`, `description`, `created_by` (FK &rarr; `Users.user_id`), `created_at`
3. **`BenchmarkRuns`**: `run_id` (PK), `query_id` (FK &rarr; `QueryCatalog.query_id`), `user_id` (FK &rarr; `Users.user_id`), `started_at`, `status`, `environment_note`
4. **`BenchmarkResults`**: `result_id` (PK), `run_id` (FK &rarr; `BenchmarkRuns.run_id`), `test_label`, `elapsed_ms`, `rows_returned`, `plan_summary`, `recorded_at`
5. **`IndexExperiments`**: `experiment_id` (PK), `run_id` (FK &rarr; `BenchmarkRuns.run_id`), `index_name`, `action`, `notes`, `created_at`
6. **`OptimizationSuggestions`**: `suggestion_id` (PK), `run_id` (FK &rarr; `BenchmarkRuns.run_id`), `suggestion_text`, `rationale`, `status`, `created_at`
7. **`BenchmarkAudit`**: `audit_id` (PK), `result_id` (FK &rarr; `BenchmarkResults.result_id`), `event_type`, `event_time`, `details`
8. **`DemoRecords`**: `record_id` (PK), `category`, `status`, `amount`, `customer_name`, `created_at` *(100,000 synthetic rows)*

---

## 🚀 4. How to Run the Project

### Option A: 1-Click Launch (Recommended for Windows)
Simply double-click:
```cmd
run.bat
```
This automatically verifies dependencies and starts the Flask server at `http://localhost:5000`.

---

### Option B: Manual Command-Line Startup
1. **Install Requirements**:
   ```bash
   pip install -r requirements.txt
   ```
2. **(Optional) Setup MySQL Database**:
   Open **MySQL Workbench** or MySQL CLI and run:
   ```sql
   SOURCE database/schema.sql;
   ```
   *Note: If MySQL server is not running, the application automatically launches in **Zero-Config Standalone Mode** using the embedded engine, ensuring 100% demo availability anytime!*

3. **Populate Testbed Dataset (100,000 Rows)**:
   ```bash
   python database/seed_data.py
   ```

4. **Start Web Server**:
   ```bash
   python app.py
   ```
5. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

---

## 📸 5. Viva Voce & Academic Report Screenshots Guide

To capture the figures required for Chapter 6 of your academic project report:
* **Figure 6.1 & 6.2 (Schema & Tables)**: Run `SHOW TABLES;` and `DESCRIBE Users;` in MySQL Workbench (or inspect in `database/test_queries.sql`).
* **Figure 6.3 & 6.4 (Query Catalog)**: Open the **Query Catalog** tab in the web dashboard.
* **Figure 6.5 (Baseline Full Table Scan)**: In the **Benchmark Lab** tab, run a test without an index (`type: ALL`, ~60–100 ms).
* **Figure 6.7 (Trigger Verification)**: Open the **Trigger Audit Trail** tab to show `BenchmarkAudit` rows generated automatically by `trg_benchmark_result_audit`.
* **Figure 6.8 (Stored Procedure)**: Open the **Stored Procedure** tab and click `Invoke Procedure` to show `CALL GetBenchmarkHistory(1);`.
* **Figure 6.9 (Database View)**: Open the **Database View** tab showing `SELECT * FROM BenchmarkSummary;`.
* **Figure 6.10 (Before vs After Chart)**: Create index `idx_demo_records_status` in the lab and run the benchmark again. The side-by-side Chart.js comparison displays a **95%+ speedup**!

---

## 🎓 6. Common Viva Questions & Answers

**Q1: Why did you normalize your schema into 3NF?**
> *Answer:* To eliminate update, insertion, and deletion anomalies. For instance, query definitions are maintained solely in `QueryCatalog` rather than repeated across thousands of benchmark runs.

**Q2: Why does an index improve query performance?**
> *Answer:* Without an index, the database engine must inspect all 100,000 records using a Full Table Scan ($O(N)$). A B-Tree index organizes keys into a balanced tree structure ($O(\log N)$), directing the engine straight to matching rows via pointer traversals (`type: ref`).

**Q3: Where is your Database Trigger used?**
> *Answer:* `trg_benchmark_result_audit` fires `AFTER INSERT` on `BenchmarkResults`, copying key execution metrics into `BenchmarkAudit` for auditability and event logging without needing manual application logic.

**Q4: Where is your Stored Procedure used?**
> *Answer:* `GetBenchmarkHistory(p_query_id)` encapsulates the join between `QueryCatalog`, `BenchmarkRuns`, and `BenchmarkResults`, ensuring consistent, reusable history retrieval at the database engine level.

---
*Created for Sahyadri College of Engineering & Management, Mangaluru.*
