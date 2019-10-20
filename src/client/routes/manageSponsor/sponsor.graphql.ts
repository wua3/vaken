import gql from 'graphql-tag';

export default gql`
	query sponsor {
		me {
			id
			email
		}
	}

	query tiers {
		tiers {
			id
			name
			permissions
		}
	}

	query companies {
		companies {
			id
			name
			tier {
				id
				name
				permissions
			}
		}
	}

	mutation sponsorStatus($input: SponsorStatusInput!) {
		sponsorStatus(input: $input) {
			id
			status
		}
	}

	mutation createSponsor($input: SponsorInput!) {
		createSponsor(input: $input) {
			id
			email
		}
	}

	mutation createTier($input: TierInput!) {
		createTier(input: $input) {
			id
			name
			permissions
		}
	}

	mutation createCompany($input: CompanyInput!) {
		createCompany(input: $input) {
			id
			name
			tier {
				id
				name
			}
		}
	}
`;