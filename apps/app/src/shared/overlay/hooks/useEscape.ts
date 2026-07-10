import { useEffect } from 'react';

interface UseEscapeProps {
  open: boolean;
  onClose: () => void;
}

export function useEscape({ open, onClose }: UseEscapeProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);
}
