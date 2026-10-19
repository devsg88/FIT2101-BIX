// US-09 / SCRUM-178 (AC3). Shows who the Scrum Master and Product Owner of a
// sprint are, so everyone on the board can see ownership.
//
//   sprint   the sprint from the board data: scrum_master_id,
//            scrum_master_name, product_owner_identifier
//   compact  one short line for a PBI card, instead of the full badges
export default function WorkItemRoles({ sprint, compact = false }) {
  if (!sprint) {
    return null;
  }

  const hasScrumMaster =
    sprint.scrum_master_id !== null && sprint.scrum_master_id !== undefined;
  const scrumMasterName = hasScrumMaster
    ? sprint.scrum_master_name ?? `User ${sprint.scrum_master_id}`
    : null;
  const productOwner = sprint.product_owner_identifier || null;

  if (compact) {
    if (!scrumMasterName && !productOwner) {
      return null;
    }
    return (
      <p className="work-item-roles__compact">
        {scrumMasterName && <span>SM: @{scrumMasterName}</span>}
        {productOwner && <span>PO: {productOwner}</span>}
      </p>
    );
  }

  return (
    <dl className="work-item-roles" aria-label={`Roles for ${sprint.name}`}>
      <div className="work-item-roles__role">
        <dt>Scrum Master</dt>
        <dd>
          {scrumMasterName ? (
            <span className="work-item-roles__person">
              <span className="work-item-roles__avatar" aria-hidden="true">
                {scrumMasterName.charAt(0).toUpperCase()}
              </span>
              @{scrumMasterName}
            </span>
          ) : (
            <span className="work-item-roles__unset">Not assigned</span>
          )}
        </dd>
      </div>
      <div className="work-item-roles__role">
        <dt>Product Owner</dt>
        <dd>
          {productOwner ? (
            <span className="work-item-roles__person">{productOwner}</span>
          ) : (
            <span className="work-item-roles__unset">Not assigned</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
