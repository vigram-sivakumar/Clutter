import { useRef, useState } from 'react';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { parseWebUrl } from '@shared/helpers/parseWebUrl';
import './ImagePicker.Link.css';

interface ImagePickerLinkProps {
  /**
   * Called only once the URL has been confirmed to actually load as an
   * image — the caller's own "commit + close the picker" behavior
   * (ResourceTopBarActions.tsx's onLinkSubmit) is unchanged and doesn't
   * need to know any of this happened first.
   */
  onSubmit: (url: string) => void;
}

type Status = 'idle' | 'checking' | 'error';

export function ImagePickerLink({ onSubmit }: ImagePickerLinkProps) {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Holds the in-flight preload probe. Two jobs at once: (1) keeps a
  // real reference to the Image alive for the duration of the check —
  // its onload/onerror closures already reference `probe` directly, but
  // this ref is the explicit guarantee nothing GCs it mid-flight — and
  // (2) is the "is this result still current" token: if the user edits
  // the field and submits again before a previous probe resolves, that
  // stale probe's eventual onload/onerror compares itself against this
  // ref and discards its own result instead of acting on it.
  const pendingProbeRef = useRef<HTMLImageElement | null>(null);

  const handleSubmit = () => {
    if (status === 'checking') {
      return;
    }

    const url = link.trim();
    if (!url) {
      return;
    }

    const parsed = parseWebUrl(url);
    if (!parsed) {
      setStatus('error');
      setErrorMessage('Enter a valid web address (starting with http:// or https://).');
      return;
    }

    setStatus('checking');
    setErrorMessage(null);

    const probe = new Image();
    pendingProbeRef.current = probe;

    probe.onload = () => {
      if (pendingProbeRef.current !== probe) {
        return;
      }
      pendingProbeRef.current = null;
      setStatus('idle');
      onSubmit(url);
    };
    probe.onerror = () => {
      if (pendingProbeRef.current !== probe) {
        return;
      }
      pendingProbeRef.current = null;
      setStatus('error');
      setErrorMessage("Couldn't load this image. Check the URL and try again.");
    };
    probe.src = parsed.href;
  };

  return (
    <div className="image-picker-link">
      <Input
        type="url"
        placeholder="Paste image URL"
        value={link}
        onChange={(event) => {
          setLink(event.target.value);
          if (status === 'error') {
            setStatus('idle');
            setErrorMessage(null);
          }
        }}
      />
      <Button variant="primary" onClick={handleSubmit} disabled={status === 'checking'}>
        {status === 'checking' ? 'Adding…' : 'Add'}
      </Button>
      {status === 'error' && errorMessage ? (
        <span className="image-picker-link__error" role="alert">
          {errorMessage}
        </span>
      ) : (
        <span className="input__hint">You can add any image from the web.</span>
      )}
    </div>
  );
}
