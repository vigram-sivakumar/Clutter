import { useRef, useState } from 'react';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import type { CoverCredit } from '@core/vault/models/PageMetadata';
import { getPhoto, trackPhotoDownload } from '@core/integrations/unsplash/UnsplashApi';
import { parseUnsplashPhotoId, unsplashCoverUrl } from '@core/integrations/unsplash/unsplashAttribution';
import { parseWebUrl } from '@shared/helpers/parseWebUrl';
import './ImagePicker.Link.css';

interface ImagePickerLinkProps {
  /**
   * Called only once the URL has been confirmed to actually load as an
   * image — the caller's own "commit + close the picker" behavior
   * (ResourceTopBarActions.tsx's onLinkSubmit) is unchanged and doesn't
   * need to know any of this happened first. `credit` is set only for an Unsplash photo-page link, which is looked
   * up through the Unsplash API (never scraped) so the cover carries its photographer, as a pick from the Unsplash
   * tab does (ADR-054).
   */
  onSubmit: (url: string, credit?: CoverCredit) => void;
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

  // The same token as the image probe: an older lookup that resolves after a newer submit is discarded.
  const pendingLookupRef = useRef<string | null>(null);

  const submitUnsplashPhoto = async (photoId: string) => {
    pendingLookupRef.current = photoId;
    try {
      const photo = await getPhoto(photoId);
      if (pendingLookupRef.current !== photoId) {
        return;
      }
      pendingLookupRef.current = null;
      setStatus('idle');
      onSubmit(unsplashCoverUrl(photo.urls.regular), {
        name: photo.user.name,
        url: photo.user.links.html,
        downloadLocation: photo.links.downloadLocation,
      });
      void trackPhotoDownload(photo.links.downloadLocation);
    } catch (error) {
      if (pendingLookupRef.current !== photoId) {
        return;
      }
      pendingLookupRef.current = null;
      setStatus('error');
      setErrorMessage(
        error instanceof Error && error.message === 'Unsplash is not configured.'
          ? 'Unsplash links can’t be added right now. Use an image address instead'
          : 'Couldn’t find this photo on Unsplash. Check the link and try again'
      );
    }
  };

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
      setErrorMessage('Enter a valid web address (starting with http:// or https://)');
      return;
    }

    setStatus('checking');
    setErrorMessage(null);

    const photoId = parseUnsplashPhotoId(url);
    if (photoId) {
      void submitUnsplashPhoto(photoId);
      return;
    }

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
      setErrorMessage("Couldn’t load this image. Check the URL and try again");
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
        <span className="input__hint">You can add any image from the web</span>
      )}
    </div>
  );
}
