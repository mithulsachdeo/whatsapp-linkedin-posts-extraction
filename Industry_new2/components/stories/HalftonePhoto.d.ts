import * as React from 'react';
/** Every photograph goes through this: sepia-grey, contrast lift and a printed dot screen. */
export interface HalftonePhotoProps {
  src?: string;
  alt?: string;
  /** CSS aspect-ratio. Default "4/3". */
  ratio?: string;
  /** Italic caption under a hairline. */
  caption?: React.ReactNode;
  /** Used instead of src, e.g. an <image-slot>. */
  children?: React.ReactNode;
  className?: string;
}
export declare function HalftonePhoto(props: HalftonePhotoProps): JSX.Element;
