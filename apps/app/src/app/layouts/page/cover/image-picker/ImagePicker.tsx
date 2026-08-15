import { useState } from 'react';
import './ImagePicker.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { ImagePickerLink } from './ImagePicker.Link';
import { ImagePickerUpload } from './ImagePicker.Upload';
import { ImagePickerUnsplash } from './ImagePicker.Unsplash';
import { AppIcon } from '@shared/icon';
import { Button } from '@components/button/Button';

interface ImagePickerProps {
  hasCoverImage: boolean;
  onRemove: () => void;
  onClose: () => void;
  onLinkSubmit: (url: string) => void;
  onUploadSubmit: (filePath: string) => void;
}

type ImagePickerTab = 'hide' | 'image';
type ImageSource = 'upload' | 'link' | 'unsplash';

const IMAGE_SOURCE_STORAGE_KEY = 'clutter-cover-picker-source';

function readStoredImageSource(): ImageSource {
  const stored = localStorage.getItem(IMAGE_SOURCE_STORAGE_KEY);

  if (stored === 'upload' || stored === 'link' || stored === 'unsplash') {
    return stored;
  }

  return 'upload';
}

export function ImagePicker({
  hasCoverImage,
  onRemove,
  onClose,
  onLinkSubmit,
  onUploadSubmit,
}: ImagePickerProps) {
  const [activeTab, setActiveTab] = useState<ImagePickerTab>(
    hasCoverImage ? 'image' : 'hide'
  );

  const [imageSource, setImageSource] = useState<ImageSource>(
    readStoredImageSource
  );

  const handleImageSourceChange = (source: ImageSource) => {
    localStorage.setItem(IMAGE_SOURCE_STORAGE_KEY, source);
    setImageSource(source);
  };

  const handleTabChange = (tab: string) => {
    const nextTab = tab as ImagePickerTab;

    setActiveTab(nextTab);

    if (nextTab === 'hide') {
      onRemove();
    }
  };

  return (
    <div className="image-picker">
      <span className="image-picker__header">
        Cover
        <Button isIconOnly size="small" interaction="subtle" onClick={onClose}>
          <AppIcon icon="dismiss" />
        </Button>
      </span>
      <div className="image-picker__tabs">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <Tab value="hide">
            <AppIcon icon="hide" />
          </Tab>

          <Tab value="image">
            <AppIcon icon="image" />
          </Tab>
        </Tabs>
      </div>

      {activeTab === 'image' && (
        <>
          <div className="image-picker__buttons">
            <button
              className={`image-picker__button ${
                imageSource === 'upload' ? 'image-picker__button--selected' : ''
              }`}
              type="button"
              onClick={() => handleImageSourceChange('upload')}
            >
              <AppIcon icon="uploadImage" />
              <span>Upload</span>
            </button>

            <button
              className={`image-picker__button ${
                imageSource === 'link' ? 'image-picker__button--selected' : ''
              }`}
              type="button"
              value="link"
              onClick={() => handleImageSourceChange('link')}
            >
              <AppIcon icon="link" />
              <span>Link</span>
            </button>

            <button
              className={`image-picker__button ${
                imageSource === 'unsplash'
                  ? 'image-picker__button--selected'
                  : ''
              }`}
              type="button"
              onClick={() => handleImageSourceChange('unsplash')}
            >
              <AppIcon icon="unsplash" />
              <span>Unsplash</span>
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
