import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SQLite from 'expo-sqlite';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { Buffer } from 'buffer';

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
  db: SQLite.SQLiteDatabase | null;
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

const DB_NAME = 'kline.sqlite';
const DB_DIR = `${FileSystemLegacy.documentDirectory}SQLite/`;

export const SQLiteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const copyDatabase = async () => {
    const localDbPath = `${DB_DIR}${DB_NAME}`;
    const assetDbPath = `${FileSystemLegacy.bundleDirectory}kline_1y_smalldemo.sqlite`;

    const localExists = await FileSystemLegacy.getInfoAsync(localDbPath);
    if (!localExists.exists) {
      const assetExists = await FileSystemLegacy.getInfoAsync(assetDbPath);
      if (assetExists.exists) {
        await FileSystemLegacy.makeDirectoryAsync(DB_DIR, { intermediates: true });
        await FileSystemLegacy.copyAsync({
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
        await copyDatabase();
        // 确保目录存在
        await FileSystemLegacy.makeDirectoryAsync(DB_DIR, { intermediates: true });
        const database = await SQLite.openDatabaseAsync(DB_NAME, {}, DB_DIR.replace(/\/$/, ''));
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
    if (!db || !isConnected) return [];
    try {
      const rows = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      return rows.map((r) => r.name);
    } catch (error) {
      console.error('getTables failed:', error);
      return [];
    }
  };

  const getStockCount = async (): Promise<number> => {
    if (!db || !isConnected) return 0;
    try {
      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM stocks'
      );
      return row?.count || 0;
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      if (!msg.includes('no such table')) {
        console.error('getStockCount failed:', error);
      }
      return 0;
    }
  };

  const getKlineCount = async (): Promise<number> => {
    if (!db || !isConnected) return 0;
    try {
      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM kline_daily'
      );
      return row?.count || 0;
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      if (!msg.includes('no such table')) {
        console.error('getKlineCount failed:', error);
      }
      return 0;
    }
  };

  const getStocks = async (): Promise<Stock[]> => {
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<Stock>(
        'SELECT code, name, market, sector_id AS sectorId, status FROM stocks'
      );
      return rows;
    } catch (error) {
      console.error('getStocks failed:', error);
      return [];
    }
  };

  const getKlineByCode = async (code: string): Promise<KlineDaily[]> => {
    if (!db) return [];
    try {
      const rows = await db.getAllAsync<KlineDaily>(
        'SELECT code, date, open, high, low, close, volume, amount FROM kline_daily WHERE code = ? ORDER BY date ASC',
        [code]
      );
      return rows;
    } catch (error) {
      console.error('getKlineByCode failed:', error);
      return [];
    }
  };

  const getMeta = async (): Promise<Record<string, string>> => {
    if (!db || !isConnected) return {};
    try {
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM meta'
      );
      const meta: Record<string, string> = {};
      for (const row of rows) {
        meta[row.key] = row.value;
      }
      return meta;
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      if (!msg.includes('no such table')) {
        console.error('getMeta failed:', error);
      }
      return {};
    }
  };

  const importDatabase = async (fileUri: string): Promise<DatabaseImportResult> => {
    try {
      const localDbPath = `${DB_DIR}${DB_NAME}`;
      const timestamp = Date.now();
      const backupPath = `${DB_DIR}kline_backup_${timestamp}.sqlite`;

      // 关闭当前数据库连接
      if (db) {
        await db.closeAsync();
        setDb(null);
        setIsConnected(false);
      }

      await FileSystemLegacy.makeDirectoryAsync(DB_DIR, { intermediates: true });

      const localExists = await FileSystemLegacy.getInfoAsync(localDbPath);
      let createdBackup = '';
      if (localExists.exists) {
        await FileSystemLegacy.copyAsync({
          from: localDbPath,
          to: backupPath,
        });
        createdBackup = backupPath;
      }

      await FileSystemLegacy.copyAsync({
        from: fileUri,
        to: localDbPath,
      });

      const newDb = await SQLite.openDatabaseAsync(DB_NAME, {}, DB_DIR.replace(/\/$/, ''));
      setDb(newDb);
      setIsConnected(true);

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
      const dirInfo = await FileSystemLegacy.readDirectoryAsync(DB_DIR);
      const backups = dirInfo
        .filter((name) => name.startsWith('kline_backup_') && name.endsWith('.sqlite'))
        .sort()
        .reverse()
        .map((name) => `${DB_DIR}${name}`);
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
