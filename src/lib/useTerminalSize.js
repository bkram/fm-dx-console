import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export const MIN_COLS = 80;
export const MIN_ROWS = 24;

export default function useTerminalSize() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({
        cols: stdout.columns || MIN_COLS,
        rows: stdout.rows || MIN_ROWS,
    });
    useEffect(() => {
        const onResize = () => setSize({ cols: stdout.columns, rows: stdout.rows });
        stdout.on('resize', onResize);
        return () => stdout.off('resize', onResize);
    }, [stdout]);
    return size;
}
