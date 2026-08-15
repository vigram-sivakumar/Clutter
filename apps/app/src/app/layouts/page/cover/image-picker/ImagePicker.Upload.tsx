import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@components/button/Button';
import './ImagePicker.Upload.css';

interface ImagePickerUploadProps {
  onSubmit: (filePath: string) => void;
}

export function ImagePickerUpload({ onSubmit }: ImagePickerUploadProps) {
  const handleSelect = async () => {
    const filePath = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'],
        },
      ],
    });

    if (typeof filePath === 'string') {
      onSubmit(filePath);
    }
  };

  return (
    <div className="image-picker-upload">
      <Button variant="outline-fill" onClick={handleSelect}>
        Choose image
      </Button>
      <span className="input__hint">Select an image from your computer.</span>
    </div>
  );
}
