import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkItemRoles from './WorkItemRoles.jsx';

// US-09 (SCRUM-178), AC3: the saved roles are visible to the team.

const tagged = {
  id: '3',
  name: 'Sprint 3',
  scrum_master_id: '1',
  scrum_master_name: 'Pang',
  product_owner_identifier: 'client@example.com'
};

const untagged = {
  id: '3',
  name: 'Sprint 3',
  scrum_master_id: null,
  scrum_master_name: null,
  product_owner_identifier: null
};

describe('WorkItemRoles', () => {
  it('shows the Scrum Master with an avatar initial and the Product Owner', () => {
    render(<WorkItemRoles sprint={tagged} />);

    expect(screen.getByText('Scrum Master')).toBeInTheDocument();
    expect(screen.getByText('@Pang')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('Product Owner')).toBeInTheDocument();
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
  });

  it('says "Not assigned" for roles nobody has been given', () => {
    render(<WorkItemRoles sprint={untagged} />);

    expect(screen.getAllByText('Not assigned')).toHaveLength(2);
  });

  it('falls back to the user id if the name is missing', () => {
    render(<WorkItemRoles sprint={{ ...tagged, scrum_master_name: null }} />);

    expect(screen.getByText('@User 1')).toBeInTheDocument();
  });

  it('renders nothing without a sprint', () => {
    const { container } = render(<WorkItemRoles sprint={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('compact (on a card)', () => {
    it('shows both roles on one line', () => {
      render(<WorkItemRoles sprint={tagged} compact />);

      expect(screen.getByText('SM: @Pang')).toBeInTheDocument();
      expect(screen.getByText('PO: client@example.com')).toBeInTheDocument();
    });

    it('renders nothing when neither role is set', () => {
      const { container } = render(<WorkItemRoles sprint={untagged} compact />);

      expect(container).toBeEmptyDOMElement();
    });
  });
});
