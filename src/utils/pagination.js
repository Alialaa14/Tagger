export const getPagination = (page = 1, limit = 10) => {
  const currentPage = parseInt(page, 10) || 1;
  const currentLimit = parseInt(limit, 10) || 10;

  // Enforce reasonable limits
  const maxLimit = 100;
  const enforcedLimit = Math.min(currentLimit, maxLimit);

  const skip = (currentPage - 1) * enforcedLimit;

  return {
    skip,
    limit: enforcedLimit,
    page: currentPage,
  };
};

export const getPaginationInfo = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};