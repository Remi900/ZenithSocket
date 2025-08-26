import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

export function useWebSocket() {
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected to server for listening');
          queryClient.invalidateQueries({ queryKey: ['/api/connection'] });
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received WebSocket message:', message);
            
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['/api/instances'] });
            queryClient.invalidateQueries({ queryKey: ['/api/connection'] });
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket connection closed:', event.code, event.reason);
          wsRef.current = null;
          queryClient.invalidateQueries({ queryKey: ['/api/connection'] });
          
          // Don't auto-reconnect - this is a passive listener, not an active client
          // The Roblox client should be the one reconnecting
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          toast({
            title: "WebSocket Error",
            description: "Failed to connect to WebSocket server",
            variant: "destructive",
          });
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
      }
    };

    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [toast]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    socket: wsRef.current,
  };
}
