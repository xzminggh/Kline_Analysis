import React from 'react';
import { SQLiteProvider } from './src/database/SQLiteProvider';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import OverviewScreen from './src/screens/OverviewScreen';
import StrategyScreen from './src/screens/StrategyScreen';
import DetailScreen from './src/screens/DetailScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SQLiteProvider>
      <NavigationContainer>
        <Tab.Navigator>
          <Tab.Screen name="概览" component={OverviewScreen} />
          <Tab.Screen name="策略" component={StrategyScreen} />
          <Tab.Screen name="详情" component={DetailScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SQLiteProvider>
  );
}
