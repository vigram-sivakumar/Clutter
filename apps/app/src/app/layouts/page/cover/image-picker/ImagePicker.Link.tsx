import { useState } from 'react';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import './ImagePicker.Link.css';

interface ImagePickerLinkProps {
  onSubmit: (url: string) => void;
}

export function ImagePickerLink({ onSubmit }: ImagePickerLinkProps) {
  const [link, setLink] = useState('');

  const handleSubmit = () => {
    const url = link.trim();
    if (url) {
      onSubmit(url);
    }
  };

  return (
    <div className="image-picker-link">
      <Input
        type="url"
        placeholder="Paste image URL"
        value={link}
        onChange={(event) => setLink(event.target.value)}
      />
      <Button variant="primary" onClick={handleSubmit}>
        Add
      </Button>
      <span className="input__hint">You can add any image from the web.</span>
    </div>
  );
}
