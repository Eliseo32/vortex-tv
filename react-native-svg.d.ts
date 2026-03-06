// Stub de tipos para react-native-svg
// Requerido por lucide-react-native para resolver SvgProps
declare module 'react-native-svg' {
    import { ComponentType } from 'react';

    export interface SvgProps {
        width?: number | string;
        height?: number | string;
        viewBox?: string;
        color?: string;
        fill?: string;
        stroke?: string;
        strokeWidth?: number | string;
        opacity?: number | string;
        fillOpacity?: number | string;
        strokeOpacity?: number | string;
        className?: string;
        style?: any;
        children?: any;
        [key: string]: any;
    }

    export const Svg: ComponentType<SvgProps>;
    export const Path: ComponentType<any>;
    export const Circle: ComponentType<any>;
    export const Rect: ComponentType<any>;
    export const Line: ComponentType<any>;
    export const G: ComponentType<any>;
    export const Polygon: ComponentType<any>;
    export const Polyline: ComponentType<any>;
    export const Ellipse: ComponentType<any>;
    export const Defs: ComponentType<any>;
    export const LinearGradient: ComponentType<any>;
    export const RadialGradient: ComponentType<any>;
    export const Stop: ComponentType<any>;
    export const ClipPath: ComponentType<any>;
    export const Mask: ComponentType<any>;
    export const Text: ComponentType<any>;
    export const TSpan: ComponentType<any>;
    export const Use: ComponentType<any>;
    export const Symbol: ComponentType<any>;

    export default Svg;
}
