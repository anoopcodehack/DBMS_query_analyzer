"""
Database Query Performance Analyzer - High-Performance Dataset Seeder
Generates 100,000 realistic records into DemoRecords in bulk batches.
Demonstrates Full Table Scan vs B-Tree Index Lookups.
"""

import os
import time
import random
from datetime import datetime, timedelta

CATEGORIES = [
    'ELECTRONICS', 'APPAREL', 'HOME_GOODS', 'BOOKS', 
    'GROCERIES', 'AUTOMOTIVE', 'SPORTS', 'TOYS'
]

STATUSES = ['ACTIVE', 'PENDING', 'CANCELLED', 'ARCHIVED', 'COMPLETED']

FIRST_NAMES = ['Rahul', 'Priya', 'Aarav', 'Ananya', 'Rohan', 'Sneha', 'Vikram', 'Divya', 'Karan', 'Pooja', 'Nikhil', 'Tanvi']
LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Rao', 'Shetty', 'Kumar', 'Hegde', 'Nair', 'Bhat', 'Kamath', 'Fernandes']

def generate_batch(batch_size=5000, start_date=None):
    if start_date is None:
        start_date = datetime(2025, 1, 1)
    
    rows = []
    base_timestamp = start_date.timestamp()
    
    for _ in range(batch_size):
        category = random.choice(CATEGORIES)
        status = random.choice(STATUSES)
        amount = round(random.uniform(50.0, 15000.0), 2)
        customer = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        random_seconds = random.randint(0, 365 * 24 * 3600)
        created_at = datetime.fromtimestamp(base_timestamp + random_seconds).strftime('%Y-%m-%d %H:%M:%S')
        rows.append((category, status, amount, customer, created_at))
        
    return rows

def seed_mysql(host, port, user, password, database, total_rows=100000, batch_size=5000):
    import mysql.connector
    print(f"Connecting to MySQL ({host}:{port}, db={database})...")
    conn = mysql.connector.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database
    )
    cursor = conn.cursor()
    
    # Check existing count
    cursor.execute("SELECT COUNT(*) FROM DemoRecords")
    existing = cursor.fetchone()[0]
    if existing >= total_rows:
        print(f"DemoRecords already contains {existing:,} rows. Skipping seed.")
        cursor.close()
        conn.close()
        return existing

    print(f"Current count: {existing:,}. Seeding up to {total_rows:,} records in batches of {batch_size:,}...")
    start_time = time.perf_counter()
    inserted = 0
    
    sql = """
        INSERT INTO DemoRecords (category, status, amount, customer_name, created_at)
        VALUES (%s, %s, %s, %s, %s)
    """
    
    while inserted < (total_rows - existing):
        batch = generate_batch(min(batch_size, (total_rows - existing) - inserted))
        cursor.executemany(sql, batch)
        conn.commit()
        inserted += len(batch)
        print(f"  -> Inserted {inserted + existing:,} / {total_rows:,} rows ({(inserted + existing)/total_rows*100:.1f}%)")

    total_time = time.perf_counter() - start_time
    print(f"[SUCCESS] Seeded {inserted:,} rows into MySQL DemoRecords in {total_time:.2f} seconds.")
    cursor.close()
    conn.close()
    return total_rows

def seed_sqlite(db_path, total_rows=100000, batch_size=5000):
    import sqlite3
    print(f"Connecting to SQLite ({db_path})...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM DemoRecords")
    existing = cursor.fetchone()[0]
    if existing >= total_rows:
        print(f"DemoRecords already contains {existing:,} rows. Skipping seed.")
        conn.close()
        return existing
        
    print(f"Current count: {existing:,}. Seeding up to {total_rows:,} records in batches of {batch_size:,}...")
    start_time = time.perf_counter()
    inserted = 0
    
    sql = """
        INSERT INTO DemoRecords (category, status, amount, customer_name, created_at)
        VALUES (?, ?, ?, ?, ?)
    """
    
    while inserted < (total_rows - existing):
        batch = generate_batch(min(batch_size, (total_rows - existing) - inserted))
        cursor.executemany(sql, batch)
        conn.commit()
        inserted += len(batch)
        print(f"  -> Inserted {inserted + existing:,} / {total_rows:,} rows ({(inserted + existing)/total_rows*100:.1f}%)")
        
    total_time = time.perf_counter() - start_time
    print(f"[SUCCESS] Seeded {inserted:,} rows into SQLite DemoRecords in {total_time:.2f} seconds.")
    conn.close()
    return total_rows

if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    
    db_type = os.getenv('DB_ENGINE', 'MYSQL').upper()
    host = os.getenv('DB_HOST', 'localhost')
    port = int(os.getenv('DB_PORT', 3306))
    user = os.getenv('DB_USER', 'root')
    password = os.getenv('DB_PASSWORD', '')
    database = os.getenv('DB_NAME', 'query_performance_analyzer')
    sqlite_path = os.getenv('SQLITE_PATH', os.path.join(os.path.dirname(__file__), 'analyzer.db'))
    
    if db_type == 'MYSQL':
        try:
            seed_mysql(host, port, user, password, database)
        except Exception as e:
            print(f"MySQL connection failed: {e}")
            print(f"Falling back to embedded SQLite testbed: {sqlite_path}")
            seed_sqlite(sqlite_path)
    else:
        seed_sqlite(sqlite_path)
