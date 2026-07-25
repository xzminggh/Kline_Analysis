import sys
import sqlite3

def main():
    if len(sys.argv) < 3 or sys.argv[1] != '--db':
        print("Usage: python3 verify_schema.py --db <db_path>")
        sys.exit(1)
    
    db_path = sys.argv[2]
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        
        required_tables = ['kline_daily', 'stocks', 'meta', 'sectors', 'sector_members']
        missing = [t for t in required_tables if t not in tables]
        
        if missing:
            print(f"FAIL: Missing tables: {missing}")
            sys.exit(1)
        
        cursor.execute("SELECT COUNT(*) FROM kline_daily;")
        kline_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM stocks;")
        stock_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT value FROM meta WHERE key='total_count';")
        meta_total = cursor.fetchone()
        meta_total = int(meta_total[0]) if meta_total else 0
        
        if kline_count == 0:
            print("FAIL: kline_daily has 0 rows")
            sys.exit(1)
        
        if stock_count == 0:
            print("FAIL: stocks has 0 rows")
            sys.exit(1)
        
        print(f"PASS: Schema verified. Tables: {tables}")
        print(f"PASS: kline_daily: {kline_count} rows")
        print(f"PASS: stocks: {stock_count} rows")
        conn.close()
        sys.exit(0)
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
