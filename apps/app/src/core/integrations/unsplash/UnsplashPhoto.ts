export interface UnsplashPhoto {
  id: string;

  width: number;
  height: number;

  urls: {
    small: string;
    regular: string;
  };

  user: {
    name: string;
    links: {
      html: string;
    };
  };

  links: {
    html: string;
    downloadLocation: string;
  };
}
