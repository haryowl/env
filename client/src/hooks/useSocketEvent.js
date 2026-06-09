import { useEffect, useRef } from 'react';

/**
 * Subscribe to a SocketService event with automatic cleanup.
 * Handler always sees latest closure via ref (safe for device/filter deps).
 */
export function useSocketEvent(socket, event, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !socket || typeof socket.on !== 'function') {
      return undefined;
    }

    const listener = (payload) => {
      handlerRef.current(payload);
    };

    socket.on(event, listener);
    return () => {
      if (typeof socket.off === 'function') {
        socket.off(event, listener);
      }
    };
  }, [socket, event, enabled]);
}
