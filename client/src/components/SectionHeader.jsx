import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Slim section header matching PageHeader style.
 * Use inside cards/sections (Data Filters, tables, etc.). Optional `center` fills space between title and `right`.
 */
export default function SectionHeader({
  icon,
  title,
  subtitle,
  center,
  right,
  sx,
  compact = false,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'flex-start',
        flexWrap: 'wrap',
        gap: compact ? 0.75 : 1.25,
        px: compact ? 1.5 : 2,
        py: compact ? 0.65 : 1.25,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...(sx || {}),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Box
          sx={{
            width: compact ? 26 : 30,
            height: compact ? 26 : 30,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: compact ? 1 : 1.25,
            bgcolor: 'rgba(37, 99, 235, 0.10)',
            color: 'primary.main',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            sx={{
              fontWeight: 800,
              color: 'text.primary',
              fontSize: compact ? '0.82rem' : '0.95rem',
              lineHeight: compact ? 1.2 : 1.15,
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontWeight: 600,
                fontSize: compact ? '0.68rem' : undefined,
                lineHeight: 1.25,
                display: 'block',
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      {center ? (
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {center}
        </Box>
      ) : null}
      {right ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexShrink: 0,
            ml: 'auto',
          }}
        >
          {right}
        </Box>
      ) : null}
    </Box>
  );
}

