import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

export interface Stock {
  code: string;
  name: string;
  market: string;
  sectorId: string;
  status: string;
}

export interface KlineDaily {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface DatabaseImportResult {
  success: boolean;
  backupPath?: string;
  error?: string;
}

export interface DatabaseContextType {
  db: SQLite.Database | null;
  isConnected: boolean;
  isLoading: boolean;
  getTables: () => Promise<string[]>;
  getStockCount: () => Promise<number>;
  getKlineCount: () => Promise<number>;
  getStocks: () => Promise<Stock[]>;
  getKlineByCode: (code: string) => Promise<KlineDaily[]>;
  getMeta: () => Promise<Record<string, string>>;
  importDatabase: (fileUri: string) => Promise<DatabaseImportResult>;
  getBackupList: () => Promise<string[]>;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within SQLiteProvider');
  }
  return context;
};

export const SQLiteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SQLite.Database | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const copyDatabase = async () => {
    const dbName = 'kline.sqlite';
    const localDbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;
    const assetDbPath = `${FileSystem.bundleDirectory}kline_1y_smalldemo.sqlite`;

    const localExists = await FileSystem.getInfoAsync(localDbPath);
    if (!localExists.exists) {
      const assetExists = await FileSystem.getInfoAsync(assetDbPath);
      if (assetExists.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}SQLite`, { intermediates: true });
        await FileSystem.copyAsync({
          from: assetDbPath,
          to: localDbPath,
        });
      }
    }
    return localDbPath;
  };

  useEffect(() => {
    const initDatabase = async () => {
      setIsLoading(true);
      try {
        const dbPath = await copyDatabase();
        const database = SQLite.openDatabase('kline');
        setDb(database);
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      } finally {
        setIsLoading(false);
      }
    };
    initDatabase();
  }, []);

  const getTables = async (): Promise<string[]> => {
    if (!db) return [];
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql("SELECT name FROM sqlite_master WHERE type='table'", [], (_, { rows }) => {
          const tables: string[] = [];
          for (let i = 0; i < rows.length; i++) {
            tables.push(rows.item(i).name);
          }
          resolve(tables);
        });
      });
    });
  };

  const getStockCount = async (): Promise<number> => {
    if (!db) return 0;
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql('SELECT COUNT(*) as count FROM stocks', [], (_, { rows }) => {
          resolve(rows.item(0)?.count || 0);
        });
      });
    });
  };

  const getKlineCount = async (): Promise<number> => {
    if (!db) return 0;
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql('SELECT COUNT(*) as count FROM kline_daily', [], (_, { rows }) => {
          resolve(rows.item(0)?.count || 0);
        });
      });
    });
  };

  const getStocks = async (): Promise<Stock[]> => {
    if (!db) return [];
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql('SELECT code, name, market, sector_id AS sectorId, status FROM stocks', [], (_, { rows }) => {
          const stocks: Stock[] = [];
          for (let i = 0; i < rows.length; i++) {
            stocks.push(rows.item(i));
          }
          resolve(stocks);
        });
      });
    });
  };

  const getKlineByCode = async (code: string): Promise<KlineDaily[]> => {
    if (!db) return [];
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql(
          'SELECT code, date, open, high, low, close, volume, amount FROM kline_daily WHERE code = ? ORDER BY date ASC',
          [code],
          (_, { rows }) => {
            const klines: KlineDaily[] = [];
            for (let i = 0; i < rows.length; i++) {
              klines.push(rows.item(i));
            }
            resolve(klines);
          }
        );
      });
    });
  };

  const getMeta = async (): Promise<Record<string, string>> => {
    if (!db) return {};
    return new Promise((resolve) => {
      db.transaction((tx) => {
        tx.executeSql('SELECT key, value FROM meta', [], (_, { rows }) => {
          const meta: Record<string, string> = {};
          for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            meta[row.key] = row.value;
          }
          resolve(meta);
        });
      });
    });
  };

  const importDatabase = async (fileUri: string): Promise<DatabaseImportResult> => {
    try {
      const dbName = 'kline.sqlite';
      const localDbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;
      const timestamp = Date.now();
      const backupPath = `${FileSystem.documentDirectory}SQLite/kline_backup_${timestamp}.sqlite`;

      const localExists = await FileSystem.getInfoAsync(localDbPath);
      let createdBackup = '';
      if (localExists.exists) {
        await FileSystem.copyAsync({
          from: localDbPath,
          to: backupPath,
        });
        createdBackup = backupPath;
      }

      await FileSystem.copyAsync({
        from: fileUri,
        to: localDbPath,
      });

      const newDb = SQLite.openDatabase('kline');
      setDb(newDb);

      if (createdBackup) {
        return { success: true, backupPath: createdBackup };
      }
      return { success: true };
    } catch (error: any) {
      console.error('Failed to import database:', error);
      return { success: false, error: error?.message || '未知错误' };
    }
  };

  const getBackupList = async (): Promise<string[]> => {
    try {
      const sqliteDir = `${FileSystem.documentDirectory}SQLite/`;
      const dirInfo = await FileSystem.readDirectoryAsync(sqliteDir);
      const backups = dirInfo
        .filter(name => name.startsWith('kline_backup_') && name.endsWith('.sqlite'))
        .sort()
        .reverse()
        .map(name => `${sqliteDir}${name}`);
      return backups;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  };

  const value: DatabaseContextType = {
    db,
    isConnected,
    isLoading,
    getTables,
    getStockCount,
    getKlineCount,
    getStocks,
    getKlineByCode,
    getMeta,
    importDatabase,
    getBackupList,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
