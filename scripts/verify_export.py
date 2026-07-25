import sys
import csv

def main():
    if len(sys.argv) < 3 or sys.argv[1] != '--out':
        print("Usage: python3 verify_export.py --out <csv_path>")
        sys.exit(1)
    
    csv_path = sys.argv[2]
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            rows = list(reader)
        
        if not rows:
            print("FAIL: CSV is empty")
            sys.exit(1)
        
        header = rows[0]
        required_columns = ['stock_code', 'stock_name', 'strategy_id', 'direction', 'trigger_day', 'trigger_price', 'stars']
        
        missing = [col for col in required_columns if col not in header]
        if missing:
            print(f"FAIL: Missing columns: {missing}")
            sys.exit(1)
        
        print(f"PASS: CSV has {len(rows)-1} rows")
        print(f"PASS: Header: {header}")
        sys.exit(0)
    except FileNotFoundError:
        print("FAIL: CSV file not found")
        sys.exit(1)
    except Exception as e:
        print(f"FAIL: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
