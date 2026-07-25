import sys
import sqlite3
import time
import os

def main():
    db_path = None
    timeout = 300
    
    for i in range(len(sys.argv)):
        if sys.argv[i] == '--db' and i + 1 < len(sys.argv):
            db_path = sys.argv[i+1]
        if sys.argv[i] == '--timeout' and i + 1 < len(sys.argv):
            timeout = int(sys.argv[i+1])
    
    if not db_path:
        print("Usage: python3 verify_e2e_bigdemo.py --db <db_path> [--timeout <seconds>]")
        sys.exit(1)
    
    if not os.path.exists(db_path):
        print(f"FAIL: DB file not found: {db_path}")
        sys.exit(1)
    
    start_time = time.time()
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM kline_daily;")
        kline_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM stocks;")
        stock_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT DISTINCT code FROM kline_daily;")
        distinct_stocks = len(cursor.fetchall())
        
        conn.close()
        
        elapsed = time.time() - start_time
        
        if elapsed > timeout:
            print(f"FAIL: Timeout exceeded. Took {elapsed:.2f}s, limit {timeout}s")
            sys.exit(1)
        
        print(f"PASS: E2E verification completed in {elapsed:.2f}s")
        print(f"PASS: kline_daily rows: {kline_count}")
        print(f"PASS: stocks count: {stock_count}")
        print(f"PASS: distinct stocks in kline: {distinct_stocks}")
        sys.exit(0)
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"FAIL: {e} (elapsed: {elapsed:.2f}s)")
        sys.exit(1)

if __name__ == '__main__':
    main()
