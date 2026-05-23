import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export default function TextPrompt({ label, hint, initialValue = '', placeholder, onSubmit, onCancel }) {
    const [value, setValue] = useState(initialValue);
    return (
        <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1} width={48}>
            <Text bold>{label}</Text>
            {hint && <Text dimColor>{hint}</Text>}
            <Box>
                <Text color="yellow">› </Text>
                <TextInput
                    value={value}
                    placeholder={placeholder || ''}
                    onChange={setValue}
                    onSubmit={(v) => onSubmit(v)}
                />
            </Box>
            <Text dimColor>Enter=apply  Esc=cancel</Text>
        </Box>
    );
}
