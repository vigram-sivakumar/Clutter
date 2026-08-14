import './ImagePicker.css';
import { ImagePickerLink } from './ImagePicker.Link';

interface ImagePickerProps {
  onLinkSubmit: (url: string) => void;
}

export function ImagePicker({ onLinkSubmit }: ImagePickerProps) {
  return (
    <div className="image-picker">
      <span className="image-picker__title">Cover</span>
      <ImagePickerLink onSubmit={onLinkSubmit} />
    </div>
  );
}
