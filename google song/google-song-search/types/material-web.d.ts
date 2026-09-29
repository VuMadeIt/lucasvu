import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MdFilledTextFieldProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  label?: string;
  value?: string;
  placeholder?: string;
  type?: string;
};

type MdFilledSelectProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  label?: string;
  value?: string;
  name?: string;
};

type MdSelectOptionProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  value?: string;
  selected?: boolean;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "md-filled-text-field": MdFilledTextFieldProps;
      "md-filled-select": MdFilledSelectProps;
      "md-select-option": MdSelectOptionProps;
    }
  }
}

export {};
