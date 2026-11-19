import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Box, Card, CardContent, CircularProgress, IconButton, Link as MuiLink, List, ListItem, ListItemButton, ListItemText,
  Stack, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Button, Title, useDataProvider, useNotify } from 'react-admin';
import { Link } from 'react-router-dom';
import type { TreeNode } from '../dataProvider';
import { LevelKey, LEVELS } from './levels';

interface Selected {
  level: LevelKey;
  node: TreeNode;
}

/** Loads one level of the tree when a node is opened. */
function Branch({ filter, depth, onSelect, selected }: {
  filter: Record<string, string>;
  depth: number;
  onSelect: (s: Selected) => void;
  selected: Selected | null;
}) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [state, setState] = useState<{ level: LevelKey | null; data: TreeNode[] } | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let live = true;
    (dataProvider as any)
      .tree(filter)
      .then((result: { level: LevelKey | null; data: TreeNode[] }) => live && setState(result))
      .catch((error: Error) => notify(error.message, { type: 'error' }));
    return () => {
      live = false;
    };
  }, [JSON.stringify(filter)]);

  if (!state) return <CircularProgress size={18} sx={{ ml: 2 + depth * 2, my: 1 }} />;
  const level = state.level ? LEVELS[state.level] : null;
  if (!level || state.data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ pl: 2 + depth * 2, py: 0.5 }}>
        {level ? `No ${level.plural.toLowerCase()} yet` : 'Nothing below this level'}
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {state.data.map((node) => {
        const isOpen = Boolean(open[node.id]);
        const isSelected = selected?.level === level.key && selected.node.id === node.id;
        return (
          <Box key={node.id}>
            <ListItem disablePadding sx={{ pl: depth * 2 }}>
              <IconButton
                size="small"
                aria-label={isOpen ? 'Close' : 'Open'}
                disabled={!node.hasChildren}
                onClick={() => setOpen({ ...open, [node.id]: !isOpen })}
                sx={{ visibility: node.hasChildren ? 'visible' : 'hidden' }}
              >
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
              <ListItemButton selected={isSelected} onClick={() => onSelect({ level: level.key, node })} sx={{ borderRadius: 1 }}>
                <ListItemText
                  primary={node.name}
                  secondary={level.singular}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            </ListItem>
            {isOpen && node.filter && (
              <Branch filter={node.filter} depth={depth + 1} onSelect={onSelect} selected={selected} />
            )}
          </Box>
        );
      })}
    </List>
  );
}

/** Contents home: the whole learning tree, Country > Grade > Subject > Master > Main > Unit > Lesson. */
export function ContentsTree() {
  const [selected, setSelected] = useState<Selected | null>(null);
  const level = selected ? LEVELS[selected.level] : null;
  return (
    <Box sx={{ mt: 2 }}>
      <Title title="Contents" />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
        <Card variant="outlined" sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          <CardContent>
            <Typography variant="h6">Learning tree</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Country, Grade, Subject, Master, Main, Unit, Lesson. Open a level to see what is inside.
            </Typography>
            <Branch filter={{}} depth={0} onSelect={setSelected} selected={selected} />
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ width: { xs: '100%', md: 340 }, flexShrink: 0 }}>
          <CardContent>
            {selected && level ? (
              <Stack spacing={1.5}>
                <Typography variant="overline">{level.singular}</Typography>
                <Typography variant="h6">{selected.node.name}</Typography>
                {selected.node.position != null && (
                  <Typography variant="body2" color="text.secondary">Position {selected.node.position}</Typography>
                )}
                <Stack direction="row" spacing={1}>
                  <Button component={Link} to={`/${level.key}/${selected.node.id}/show`} label="Open" variant="contained" />
                  <Button component={Link} to={`/${level.key}/${selected.node.id}`} label="Edit" />
                </Stack>
              </Stack>
            ) : (
              <Typography color="text.secondary">Pick an item in the tree to see it here.</Typography>
            )}
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>All pages</Typography>
              <Stack spacing={0.5}>
                {(Object.keys(LEVELS) as LevelKey[]).map((key) => (
                  <MuiLink key={key} component={Link} to={`/${key}`}>{LEVELS[key].plural}</MuiLink>
                ))}
              </Stack>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
