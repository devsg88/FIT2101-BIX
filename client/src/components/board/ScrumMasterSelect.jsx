import { useId, useState } from 'react';

// US-09 / SCRUM-178 (AC1). Tag a Scrum Master with an @ reference.
//
// Typing "@" opens a list of this project's members, narrowed by whatever
// follows it (name or email). Only picking someone from that list sets the
// value - typed text on its own is never saved - so the form can only send a
// real user id. The server still checks that id (AC4).
//
//   members       [{ id, name, email }] - the project's members
//   value         the selected user id, or null
//   selectedName  name to show for value when it is not in members (e.g. the
//                 responsible Admin, who is not listed as a member)
//   onChange      called with (id, member) on pick, or (null) on clear
export default function ScrumMasterSelect({ members, value, selectedName, onChange }) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const hasValue = value !== null && value !== undefined;
  const selected = hasValue
    ? members.find((member) => String(member.id) === String(value))
    : null;

  if (hasValue) {
    const name = selected?.name ?? selectedName ?? `User ${value}`;
    return (
      <span className="scrum-master-select__chip">
        <span>@{name}</span>
        <button
          type="button"
          className="scrum-master-select__clear"
          onClick={() => onChange(null)}
          aria-label={`Remove @${name} as Scrum Master`}
        >
          x
        </button>
      </span>
    );
  }

  const isTagging = query.startsWith('@');
  const search = query.slice(1).trim().toLowerCase();
  const matches = isTagging
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(search) ||
          (member.email ?? '').toLowerCase().includes(search)
      )
    : [];
  const isOpen = isTagging && matches.length > 0;

  const pick = (member) => {
    setQuery('');
    setActiveIndex(0);
    onChange(member.id, member);
  };

  const handleKeyDown = (event) => {
    if (!isOpen) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(matches[Math.min(activeIndex, matches.length - 1)]);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="scrum-master-select">
      <input
        type="text"
        role="combobox"
        aria-label="Scrum Master"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        placeholder="Type @ to tag a project member"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul id={listId} role="listbox" className="scrum-master-select__options">
          {matches.map((member, index) => (
            <li
              key={member.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="scrum-master-select__option"
              // mousedown, not click: picks before the input loses focus.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(member);
              }}
            >
              <span className="scrum-master-select__option-name">@{member.name}</span>
              {member.email && (
                <span className="scrum-master-select__option-email">{member.email}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {query !== '' && !isTagging && (
        <p className="scrum-master-select__hint">Start with @ to search project members.</p>
      )}
      {isTagging && matches.length === 0 && (
        <p className="scrum-master-select__hint" role="status">
          No project member matches {query}.
        </p>
      )}
    </div>
  );
}
