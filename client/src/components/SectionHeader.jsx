import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Slim section header matching PageHeader style.
 * Use inside cards/sections (Data Filters, Data Summary, etc.)
 */
export default function SectionHeader({
  icon,
  title,
  subtitle,
  right,
  sx,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.25,
        px: 2,
        py: 1.25,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...(sx || {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1.25,
            bgcolor: 'rgba(37, 99, 235, 0.10)',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.95rem', lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {right ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{right}</Box> : null}
    </Box>
  );
}

