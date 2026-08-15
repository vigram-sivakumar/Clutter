import { useState } from 'react';
import './ImagePicker.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { ImagePickerLink } from './ImagePicker.Link';
import { ImagePickerUpload } from './ImagePicker.Upload';
import { ImagePickerUnsplash } from './ImagePicker.Unsplash';
import { AppIcon } from '@shared/icon';
import { Button } from '@components/button/Button';

interface ImagePickerProps {
  onRemove: () => void;
  onClose: () => void;
  onLinkSubmit: (url: string) => void;
  onUploadSubmit: (filePath: string) => void;
}

type ImagePickerTab = 'none' | 'image';
type ImageSource = 'upload' | 'link' | 'unsplash';

export function ImagePicker({
  onRemove,
  onClose,
  onLinkSubmit,
  onUploadSubmit,
}: ImagePickerProps) {
  const [activeTab, setActiveTab] = useState<ImagePickerTab>('image');

  const [imageSource, setImageSource] = useState<ImageSource>('upload');

  const handleTabChange = (tab: string) => {
    const nextTab = tab as ImagePickerTab;

    setActiveTab(nextTab);

    if (nextTab === 'none') {
      onRemove();
    }
  };

  return (
    <div className="image-picker">
      <span className="image-picker__title">
        Cover
        <Button isIconOnly size="small" interaction="subtle" onClick={onClose}>
          <AppIcon icon="dismiss" />
        </Button>
      </span>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <Tab value="none">
          <AppIcon icon="none" />
        </Tab>

        <Tab value="image">
          <AppIcon icon="image" />
        </Tab>
      </Tabs>

      {activeTab === 'image' && (
        <>
          <div className="image-picker__buttons">
            <button
              className={`image-picker__button ${
                imageSource === 'upload' ? 'image-picker__button--selected' : ''
              }`}
              type="button"
              onClick={() => setImageSource('upload')}
            >
              <AppIcon icon="uploadImage" />
              Upload
            </button>

            <button
              className={`image-picker__button ${
                imageSource === 'link' ? 'image-picker__button--selected' : ''
              }`}
              type="button"
              value="link"
              onClick={() => setImageSource('link')}
            >
              <AppIcon icon="link" />
              Link
            </button>

            <button
              className={`image-picker__button ${
                imageSource === 'unsplash'
                  ? 'image-picker__button--selected'
                  : ''
              }`}
              type="button"
              onClick={() => setImageSource('unsplash')}
            >
              <AppIcon icon="image" />
              Unsplash
            </button>
          </div>

          {imageSource === 'upload' && (
            <ImagePickerUpload onSubmit={onUploadSubmit} />
          )}

          {imageSource === 'link' && (
            <ImagePickerLink onSubmit={onLinkSubmit} />
          )}

          {imageSource === 'unsplash' && (
            <ImagePickerUnsplash onSelect={onLinkSubmit} />
          )}
        </>
      )}
    </div>
  );
}
