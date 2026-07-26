import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error.message, errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }
      return (
        <View style={styles.container}>
          <Text style={styles.title}>组件渲染失败</Text>
          <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
          {__DEV__ && this.state.error?.stack && (
            <ScrollView style={styles.stackScroll}>
              <Text style={styles.stack}>{this.state.error.stack}</Text>
            </ScrollView>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    margin: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  title: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorMsg: {
    color: '#ffffff',
    fontSize: 12,
    marginBottom: 8,
  },
  stackScroll: {
    maxHeight: 200,
    backgroundColor: '#0a0a0f',
    borderRadius: 4,
    padding: 8,
  },
  stack: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
