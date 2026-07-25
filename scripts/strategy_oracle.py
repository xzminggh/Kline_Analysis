import sys
import json

STRATEGIES = [
    {'id': 'T01', 'name': '双均线金叉/死叉'},
    {'id': 'T02', 'name': '60日均线多空分界'},
    {'id': 'T03', 'name': '顾比均线组穿越'},
    {'id': 'T04', 'name': '三线反向反转'},
    {'id': 'M01', 'name': '布林带触轨反弹'},
    {'id': 'M02', 'name': 'RSI超买超卖'},
    {'id': 'M03', 'name': '三重过滤'},
    {'id': 'M04', 'name': '缺口回补'},
    {'id': 'P01', 'name': 'MOM动量穿零轴'},
    {'id': 'P02', 'name': 'ROC+放量确认'},
    {'id': 'P03', 'name': '倍量突破前高/前低'},
    {'id': 'P04', 'name': '大阴线/大阳线反包'},
    {'id': 'S01', 'name': '双底/双顶颈线突破'},
    {'id': 'S02', 'name': '三角形整理末端突破'},
    {'id': 'S03', 'name': '头肩底/顶颈线突破'},
    {'id': 'S04', 'name': '锤子线/流星线确认'},
    {'id': 'K01', 'name': '均线支撑/压力回踩'},
    {'id': 'K02', 'name': '前高变支撑/前低变阻力'},
    {'id': 'K03', 'name': '斐波那契回撤共振'},
    {'id': 'V01', 'name': '布林带收口突破'},
    {'id': 'V02', 'name': 'ATR窄幅后方向选择'},
    {'id': 'Q01', 'name': '地量见底'},
    {'id': 'Q02', 'name': '天量逃顶'},
    {'id': 'Q03', 'name': '尾盘异动过滤'},
    {'id': 'D01', 'name': 'MACD底/顶背离'},
    {'id': 'D02', 'name': 'RSI隐性背离'},
    {'id': 'D03', 'name': 'CCI极端拐点'},
]

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 strategy_oracle.py <command> [args]")
        sys.exit(0)
    
    command = sys.argv[1]
    
    if command == 'list':
        print(json.dumps(STRATEGIES, ensure_ascii=False, indent=2))
        sys.exit(0)
    
    if command == 'verify':
        if len(sys.argv) < 4:
            print("Usage: python3 strategy_oracle.py verify <input.json> <output.json>")
            sys.exit(1)
        
        try:
            with open(sys.argv[2], 'r') as f:
                input_data = json.load(f)
            
            with open(sys.argv[3], 'r') as f:
                output_data = json.load(f)
            
            input_strategies = set(s['id'] for s in input_data)
            output_strategies = set(s['id'] for s in output_data)
            
            if input_strategies == output_strategies:
                print("PASS: All strategies verified")
                sys.exit(0)
            else:
                print(f"FAIL: Strategy mismatch. Expected: {input_strategies}, Got: {output_strategies}")
                sys.exit(1)
        except Exception as e:
            print(f"FAIL: {e}")
            sys.exit(1)
    
    print(f"Strategy oracle command: {command}")
    sys.exit(0)

if __name__ == '__main__':
    main()
